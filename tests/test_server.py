import json
import os
import threading
import time
import unittest
from http.server import ThreadingHTTPServer
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import server


class QuietDemoHandler(server.DemoHandler):
    def log_message(self, _format, *args):
        pass


class SchedulingResolutionTests(unittest.TestCase):
    def test_broad_friday_request_returns_ranked_slot_ids(self):
        result = server.resolve_scheduling_request(
            {"scenario_key": "access", "requested_window": "Friday morning"}
        )

        self.assertEqual("options_found", result["status"])
        self.assertEqual("fri-1130", result["available_slots"][0]["slot_id"])
        self.assertEqual(1, len(result["available_slots"]))

    def test_broad_period_filters_to_matching_canonical_slots(self):
        result = server.resolve_scheduling_request(
            {
                "scenario_key": "access",
                "requested_window": "Thursday afternoon",
            }
        )

        self.assertEqual("options_found", result["status"])
        self.assertEqual(
            ["thu-1415"],
            [slot["slot_id"] for slot in result["available_slots"]],
        )

    def test_ranked_multi_day_window_returns_options_without_confirming(self):
        result = server.resolve_scheduling_request(
            {
                "scenario_key": "access",
                "requested_window": "Friday morning would be best, or Thursday",
            }
        )

        self.assertEqual("options_found", result["status"])
        self.assertEqual("fri-1130", result["available_slots"][0]["slot_id"])
        self.assertEqual(3, len(result["available_slots"]))

    def test_exact_allowlisted_window_confirms(self):
        result = server.resolve_scheduling_request(
            {
                "scenario_key": "access",
                "requested_window": "Friday at 11:30 AM",
            }
        )

        self.assertEqual("confirmed", result["status"])
        self.assertEqual("fri-1130", result["selected_slot_id"])

    def test_selected_slot_must_match_requested_window(self):
        result = server.resolve_scheduling_request(
            {
                "scenario_key": "access",
                "requested_window": "Thursday at 10:45 AM",
                "selected_slot_id": "fri-1130",
            }
        )

        self.assertEqual("needs_clarification", result["status"])

    def test_slot_id_without_repeated_window_never_confirms(self):
        result = server.resolve_scheduling_request(
            {
                "scenario_key": "access",
                "selected_slot_id": "fri-1130",
            }
        )

        self.assertEqual("needs_clarification", result["status"])

    def test_multiple_days_require_clarification(self):
        result = server.resolve_scheduling_request(
            {
                "scenario_key": "access",
                "requested_window": "Thursday or Friday at 11:30",
            }
        )

        self.assertEqual("needs_clarification", result["status"])

    def test_mismatched_day_and_time_never_confirms(self):
        result = server.resolve_scheduling_request(
            {
                "scenario_key": "access",
                "requested_window": "Thursday at 11:30 AM",
            }
        )

        self.assertNotEqual("confirmed", result["status"])

    def test_negated_slot_never_confirms(self):
        result = server.resolve_scheduling_request(
            {
                "scenario_key": "access",
                "requested_window": "Anything except Friday at 11:30 AM",
            }
        )

        self.assertEqual("needs_clarification", result["status"])

    def test_conflicting_meridiem_never_confirms(self):
        for requested_window, selected_slot_id in (
            ("Friday at 11:30 PM", ""),
            ("Friday at 11:30pm", ""),
            ("Friday at 11:30 PM", "fri-1130"),
            ("Thursday at 2:15 AM", "thu-1415"),
        ):
            with self.subTest(window=requested_window, slot=selected_slot_id):
                result = server.resolve_scheduling_request(
                    {
                        "scenario_key": "access",
                        "requested_window": requested_window,
                        "selected_slot_id": selected_slot_id,
                    }
                )
                self.assertEqual("needs_clarification", result["status"])

    def test_server_owned_context_ignores_untrusted_fields(self):
        result = server.resolve_scheduling_request(
            {
                "scenario_key": "access",
                "requested_window": "Friday at 11:30 AM",
                "patient_name": "Unverified Person",
                "facility": "Unapproved Facility",
                "visit_type": "unapproved visit",
            }
        )

        self.assertEqual("Jordan Lee", result["patient_name"])
        self.assertEqual("Northlake Imaging Center", result["facility"])
        self.assertEqual("imaging", result["visit_type"])

    def test_other_scenarios_do_not_use_scheduling(self):
        result = server.resolve_scheduling_request(
            {"scenario_key": "revenue", "requested_window": "Friday morning"}
        )

        self.assertEqual("unsupported", result["status"])


class VerificationLimitTests(unittest.TestCase):
    def setUp(self):
        server._reset_demo_session_state()

    def test_bounded_client_text_with_distant_factors_verifies(self):
        demo_session_id = server.create_demo_session_state("access")
        filler = "so i was thinking about whether my mom can drive me there "
        text = "this is jordan lee " + filler * 40
        text = text[: server.MAX_VERIFICATION_CONTEXT_CHARS - len(" july 14 1982")]
        text += " july 14 1982"
        self.assertEqual(server.MAX_VERIFICATION_CONTEXT_CHARS, len(text))

        status, result = server.record_server_verification(
            {"demo_session_id": demo_session_id, "verification_text": text}
        )

        self.assertEqual(200, status)
        self.assertEqual("verified", result["status"])

    def test_text_over_the_shared_limit_is_rejected(self):
        demo_session_id = server.create_demo_session_state("access")
        with self.assertRaises(server.RequestValidationError) as raised:
            server.record_server_verification(
                {
                    "demo_session_id": demo_session_id,
                    "verification_text": "x" * (server.MAX_VERIFICATION_CONTEXT_CHARS + 1),
                }
            )
        self.assertEqual(400, raised.exception.status)

    def test_negated_identity_statements_never_issue_a_capability(self):
        cases_path = os.path.join(
            os.path.dirname(__file__), "verification_negation_cases.json"
        )
        with open(cases_path, encoding="utf-8") as cases_file:
            cases = json.load(cases_file)

        for expected, texts in (("validation_pending", cases["denied"]), ("verified", cases["affirmed"])):
            for text in texts:
                with self.subTest(text=text):
                    demo_session_id = server.create_demo_session_state("access")
                    status, result = server.record_server_verification(
                        {"demo_session_id": demo_session_id, "verification_text": text}
                    )
                    self.assertEqual(200, status)
                    self.assertEqual(expected, result["status"])
                    self.assertEqual(
                        expected == "verified", "scheduling_capability" in result
                    )


class GroundingTests(unittest.TestCase):
    def test_complete_grounding_tail_is_preserved(self):
        request_body = {
            "scenarioKey": "access",
            "knowledge": {
                "shared": {"padding": "x" * 13_000},
                "scenario": {
                    "approvedFaq": [{"topic": "tail-marker", "answer": "present"}],
                    "closingMarker": "GROUNDING_TAIL_PRESENT",
                },
            },
            "signedInProfile": {
                "displayName": "Jordan Lee",
                "agentBriefing": "Verified demo profile.",
            },
            "demoScript": [
                {
                    "scene": "Verification",
                    "who": "Riley",
                    "text": "Thanks, that matches.",
                    "packet": ["Validation: complete"],
                }
            ],
        }

        instructions = server.build_realtime_instructions(request_body)

        self.assertIn("tail-marker", instructions)
        self.assertIn("GROUNDING_TAIL_PRESENT", instructions)
        self.assertIn("BEGIN APPROVED DEMO KNOWLEDGE", instructions)

    def test_oversized_grounding_fails_explicitly(self):
        request_body = {
            "scenarioKey": "access",
            "knowledge": {"padding": "x" * (server.MAX_GROUNDING_CHARS + 1)},
        }

        with self.assertRaises(server.RequestValidationError) as caught:
            server.build_realtime_instructions(request_body)

        self.assertEqual(413, caught.exception.status)

    def test_oversized_profile_fails_explicitly(self):
        with self.assertRaises(server.RequestValidationError) as caught:
            server.build_realtime_instructions(
                {
                    "scenarioKey": "access",
                    "knowledge": {},
                    "signedInProfile": {
                        "agentBriefing": "x" * server.MAX_PROFILE_CHARS
                    },
                }
            )

        self.assertEqual(413, caught.exception.status)

    def test_unknown_scenario_fails(self):
        with self.assertRaises(server.RequestValidationError):
            server.build_realtime_instructions(
                {"scenarioKey": "unknown", "knowledge": {}}
            )

    def test_discard_request_body_enforces_total_deadline_for_slow_partial_body(self):
        class FakeSocket:
            def __init__(self):
                self.timeout = 9.0
                self.timeouts = []

            def gettimeout(self):
                return self.timeout

            def settimeout(self, value):
                self.timeout = value
                self.timeouts.append(value)

        class FakeRFile:
            def __init__(self):
                self.called = 0

            def read1(self, size):
                self.called += 1
                time.sleep(0.03)
                return b"x" * min(size, 1024)

        handler = object.__new__(server.DemoHandler)
        handler.connection = FakeSocket()
        handler.rfile = FakeRFile()

        started_at = time.monotonic()
        with patch.object(server, "MAX_DISCARD_SECONDS", 0.12):
            handler._discard_request_body(200000)
        elapsed = time.monotonic() - started_at

        self.assertGreaterEqual(handler.rfile.called, 2)
        self.assertLessEqual(handler.rfile.called, 4)
        self.assertGreaterEqual(elapsed, 0.12)
        self.assertLess(elapsed, 0.25)
        self.assertLess(handler.connection.timeouts[1], handler.connection.timeouts[0])
        self.assertEqual(9.0, handler.connection.timeout)


class DemoHttpServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), QuietDemoHandler)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.httpd.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=5)

    def setUp(self):
        server._reset_demo_session_state()

    def request(self, path, method="GET", data=None, headers=None):
        request = Request(
            self.base_url + path,
            data=data,
            headers=headers or {},
            method=method,
        )
        try:
            with urlopen(request, timeout=5) as response:
                return response.status, response.headers, response.read()
        except HTTPError as error:
            result = error.code, error.headers, error.read()
            error.close()
            return result

    def post_json(self, path, payload):
        status, headers, body = self.request(
            path,
            method="POST",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
        )
        return status, headers, json.loads(body)

    def create_live_demo_session(self):
        fake_azure_session = {
            "value": "short-lived-azure-token",
            "id": "azure-session-id",
            "expires_at": 1234567890,
        }
        with (
            patch.dict(
                os.environ,
                {
                    "AZURE_OPENAI_ENDPOINT": "https://demo.example.azure.com",
                    "AZURE_OPENAI_API_KEY": "test-key",
                    "AZURE_OPENAI_REALTIME_DEPLOYMENT": "gpt-realtime-2.1",
                    "AZURE_OPENAI_REALTIME_VOICE": "marin",
                    "AZURE_OPENAI_REALTIME_PROTOCOL": "ga-webrtc",
                    "REALTIME_REASONING_EFFORT": "low",
                    "REALTIME_VAD_SILENCE_MS": "700",
                },
            ),
            patch.object(
                server,
                "request_ga_realtime_client_secret",
                return_value=fake_azure_session,
            ),
        ):
            status, _, payload = self.post_json(
                "/api/realtime/session",
                {"scenarioKey": "access", "knowledge": {}},
            )

        self.assertEqual(200, status)
        self.assertTrue(payload["demoSessionId"])
        self.assertEqual("gpt-realtime-2.1", payload["deployment"])
        self.assertEqual("marin", payload["voice"])
        self.assertEqual("low", payload["reasoningEffort"])
        session_update = payload["sessionUpdate"]
        self.assertNotIn("model", session_update)
        self.assertNotIn("reasoning", session_update)
        self.assertEqual(
            700,
            session_update["audio"]["input"]["turn_detection"]["silence_duration_ms"],
        )
        self.assertNotIn("test-key", json.dumps(payload))
        self.assertNotIn("instructions", payload)
        self.assertNotIn("tools", payload)
        return payload["demoSessionId"]

    def verify_live_demo_session(self, demo_session_id, verification_text):
        return self.post_json(
            "/api/demo-tools/verify-session",
            {
                "demo_session_id": demo_session_id,
                "verification_text": verification_text,
            },
        )

    def test_public_assets_have_expected_mime_types(self):
        expectations = {
            "/": "text/html",
            "/styles.css": "text/css",
            "/app.js": "text/javascript",
            "/demo-domain.js": "text/javascript",
            "/theme.js": "text/javascript",
            "/scenarios.js": "text/javascript",
            "/synthetic-data.js": "text/javascript",
        }

        for path, expected_type in expectations.items():
            with self.subTest(path=path):
                status, headers, _ = self.request(path)
                self.assertEqual(200, status)
                self.assertEqual(expected_type, headers.get_content_type())

    def test_sensitive_and_unlisted_files_are_denied_for_get_and_head(self):
        for path in ("/.env", "/.git", "/server.py", "/tests/test_server.py"):
            for method in ("GET", "HEAD"):
                with self.subTest(path=path, method=method):
                    status, _, _ = self.request(path, method=method)
                    self.assertEqual(404, status)

    def test_security_headers_allow_azure_and_microphone(self):
        with patch.dict(
            os.environ,
            {
                "AZURE_OPENAI_ENDPOINT": "https://demo.openai.azure.com",
                "AZURE_OPENAI_API_KEY": "test-key",
                "AZURE_OPENAI_REALTIME_DEPLOYMENT": "gpt-realtime-2.1",
                "AZURE_OPENAI_REALTIME_PROTOCOL": "ga-webrtc",
            },
        ):
            status, headers, _ = self.request("/")

        self.assertEqual(200, status)
        self.assertIn(
            "connect-src 'self' https://demo.openai.azure.com;",
            headers["Content-Security-Policy"],
        )
        self.assertNotIn(" https:;", headers["Content-Security-Policy"])
        self.assertEqual("microphone=(self)", headers["Permissions-Policy"])
        self.assertEqual("nosniff", headers["X-Content-Type-Options"])

    def test_csp_allows_only_self_when_realtime_is_not_configured(self):
        with patch.dict(
            os.environ, {"AZURE_OPENAI_ENDPOINT": "", "AZURE_OPENAI_API_KEY": ""}
        ):
            _, headers, _ = self.request("/")

        self.assertIn("connect-src 'self';", headers["Content-Security-Policy"])

    def test_csp_contains_the_calls_url_origin_for_both_protocols(self):
        fake_ga = {"value": "token", "id": "sess"}
        fake_legacy = {"client_secret": {"value": "token"}, "id": "sess"}
        for protocol, expected_origin in (
            ("ga-webrtc", "https://demo.openai.azure.com"),
            ("legacy-webrtc", "https://eastus2.realtimeapi-preview.ai.azure.com"),
        ):
            with (
                self.subTest(protocol=protocol),
                patch.dict(
                    os.environ,
                    {
                        "AZURE_OPENAI_ENDPOINT": "https://demo.openai.azure.com",
                        "AZURE_OPENAI_API_KEY": "test-key",
                        "AZURE_OPENAI_REALTIME_DEPLOYMENT": "gpt-realtime-2.1",
                        "AZURE_OPENAI_REALTIME_PROTOCOL": protocol,
                        "AZURE_OPENAI_REALTIME_REGION": "eastus2",
                    },
                ),
                patch.object(server, "request_ga_realtime_client_secret", return_value=fake_ga),
                patch.object(server, "request_legacy_realtime_session", return_value=fake_legacy),
            ):
                status, headers, payload = self.post_json(
                    "/api/realtime/session", {"scenarioKey": "access", "knowledge": {}}
                )
                calls_origin = "{0.scheme}://{0.netloc}".format(
                    server.urlsplit(payload["callsUrl"])
                )

                self.assertEqual(200, status)
                self.assertEqual(expected_origin, calls_origin)
                self.assertIn(
                    f"connect-src 'self' {calls_origin};",
                    headers["Content-Security-Policy"],
                )

    def test_status_reports_tuning_actually_in_effect(self):
        tuning = {
            "AZURE_OPENAI_ENDPOINT": "https://demo.openai.azure.com",
            "AZURE_OPENAI_API_KEY": "test-key",
            "REALTIME_TURN_DETECTION": "semantic_vad",
            "REALTIME_NOISE_REDUCTION": "far_field",
            "AZURE_OPENAI_REALTIME_REGION": "eastus2",
        }
        for protocol, expected in (
            ("ga-webrtc", ("semantic_vad", "far_field")),
            ("legacy-webrtc", ("server_vad", "off")),
        ):
            with (
                self.subTest(protocol=protocol),
                patch.dict(os.environ, {**tuning, "AZURE_OPENAI_REALTIME_PROTOCOL": protocol}),
            ):
                _, _, body = self.request("/api/realtime/status")
                payload = json.loads(body)
                self.assertEqual(expected, (payload["turnDetection"], payload["noiseReduction"]))

    def test_invalid_legacy_region_is_rejected_before_minting(self):
        with (
            patch.dict(
                os.environ,
                {
                    "AZURE_OPENAI_ENDPOINT": "https://demo.openai.azure.com",
                    "AZURE_OPENAI_API_KEY": "test-key",
                    "AZURE_OPENAI_REALTIME_DEPLOYMENT": "gpt-realtime-1.5",
                    "AZURE_OPENAI_REALTIME_PROTOCOL": "legacy-webrtc",
                    "AZURE_OPENAI_REALTIME_REGION": "evil.example.com/x",
                },
            ),
            patch.object(server, "request_legacy_realtime_session") as legacy,
        ):
            status, headers, payload = self.post_json(
                "/api/realtime/session", {"scenarioKey": "access", "knowledge": {}}
            )

        self.assertEqual(503, status)
        self.assertIn("AZURE_OPENAI_REALTIME_REGION", payload["error"])
        self.assertIn("connect-src 'self';", headers["Content-Security-Policy"])
        legacy.assert_not_called()

    def test_status_response_is_not_cached_or_endpoint_disclosing(self):
        status, headers, body = self.request("/api/realtime/status")
        payload = json.loads(body)

        self.assertEqual(200, status)
        self.assertEqual("no-store", headers["Cache-Control"])
        self.assertNotIn("endpoint", payload)
        self.assertNotIn("region", payload)

    def test_cross_origin_post_is_rejected(self):
        body = json.dumps(
            {"scenario_key": "access", "requested_window": "Friday morning"}
        ).encode()
        status, headers, _ = self.request(
            "/api/demo-tools/confirm-appointment",
            method="POST",
            data=body,
            headers={
                "Content-Type": "application/json",
                "Origin": "https://example.com",
            },
        )

        self.assertEqual(403, status)
        self.assertEqual("close", headers["Connection"])

    def test_malformed_origin_is_rejected_without_handler_failure(self):
        status, _, _ = self.request(
            "/api/demo-tools/confirm-appointment",
            method="POST",
            data=b"{}",
            headers={
                "Content-Type": "application/json",
                "Origin": "http://localhost:not-a-port",
            },
        )

        self.assertEqual(403, status)

    def test_allowed_local_origin_reaches_session_endpoint(self):
        body = json.dumps({"scenarioKey": "access", "knowledge": {}}).encode()
        origin = f"http://localhost:{self.httpd.server_port}"
        with patch.dict(
            os.environ,
            {
                "AZURE_OPENAI_ENDPOINT": "",
                "AZURE_OPENAI_API_KEY": "",
            },
        ):
            status, _, _ = self.request(
                "/api/realtime/session",
                method="POST",
                data=body,
                headers={"Content-Type": "application/json", "Origin": origin},
            )

        self.assertEqual(503, status)

    def test_json_content_type_is_required(self):
        status, headers, _ = self.request(
            "/api/demo-tools/confirm-appointment",
            method="POST",
            data=b"{}",
            headers={"Content-Type": "text/plain"},
        )

        self.assertEqual(415, status)
        self.assertEqual("close", headers["Connection"])

    def test_insecure_endpoints_never_receive_the_api_key(self):
        for endpoint in (
            "ws://demo.example.azure.com/openai/v1/realtime",
            "http://demo.example.azure.com",
        ):
            with (
                self.subTest(endpoint=endpoint),
                patch.dict(
                    os.environ,
                    {
                        "AZURE_OPENAI_ENDPOINT": endpoint,
                        "AZURE_OPENAI_API_KEY": "test-key",
                        "AZURE_OPENAI_REALTIME_DEPLOYMENT": "gpt-realtime-2.1",
                    },
                ),
                patch.object(server, "request_ga_realtime_client_secret") as mint,
                patch.object(server, "request_legacy_realtime_session") as legacy,
            ):
                status, _, payload = self.post_json(
                    "/api/realtime/session",
                    {"scenarioKey": "access", "knowledge": {}},
                )
                _, _, status_body = self.request("/api/realtime/status")
                status_payload = json.loads(status_body)

                self.assertEqual(503, status)
                self.assertIn("https://", payload["error"])
                mint.assert_not_called()
                legacy.assert_not_called()
                self.assertFalse(status_payload["configured"])
                self.assertTrue(status_payload["endpointInsecure"])

    def test_direct_scheduling_posts_require_verified_session_capability(self):
        requests = (
            {"scenario_key": "access", "requested_window": "Friday morning"},
            {"scenario_key": "access", "requested_window": "Friday at 9 AM"},
            {
                "scenario_key": "access",
                "requested_window": "Friday at 11:30 AM",
            },
        )

        for payload in requests:
            with self.subTest(payload=payload):
                status, _, result = self.post_json(
                    "/api/demo-tools/confirm-appointment", payload
                )
                self.assertEqual(403, status)
                self.assertEqual("validation_required", result["status"])
                self.assertNotIn(
                    result["status"],
                    {"options_found", "alternate_proposed", "confirmed"},
                )

    def test_invalid_and_cross_session_capabilities_are_rejected(self):
        first_session_id = self.create_live_demo_session()
        second_session_id = self.create_live_demo_session()
        _, _, verification = self.verify_live_demo_session(
            first_session_id, "Jordan Lee, July 14, 1982"
        )
        valid_capability = verification["scheduling_capability"]

        attempts = (
            {
                "demo_session_id": first_session_id,
                "scheduling_capability": "invalid-capability",
            },
            {
                "demo_session_id": second_session_id,
                "scheduling_capability": valid_capability,
            },
        )
        for authorization in attempts:
            with self.subTest(authorization=authorization):
                status, _, result = self.post_json(
                    "/api/demo-tools/confirm-appointment",
                    {
                        **authorization,
                        "requested_window": "Friday morning",
                    },
                )
                self.assertEqual(403, status)
                self.assertEqual("validation_required", result["status"])

    def test_expired_capability_requires_fresh_verification(self):
        demo_session_id = self.create_live_demo_session()
        issued_at = time.monotonic()
        with patch.object(server.time, "monotonic", return_value=issued_at):
            _, _, verification = self.verify_live_demo_session(
                demo_session_id, "Jordan Lee, July 14, 1982"
            )

        expired_at = issued_at + server.SCHEDULING_CAPABILITY_TTL_SECONDS + 1
        with patch.object(
            server.time,
            "monotonic",
            return_value=expired_at,
        ):
            pending_status, _, pending = self.verify_live_demo_session(
                demo_session_id, "x"
            )
            scheduling_status, _, scheduling = self.post_json(
                "/api/demo-tools/confirm-appointment",
                {
                    "demo_session_id": demo_session_id,
                    "scheduling_capability": verification[
                        "scheduling_capability"
                    ],
                    "requested_window": "Friday morning",
                },
            )
            _, _, reverified = self.verify_live_demo_session(
                demo_session_id, "Jordan Lee, July 14, 1982"
            )

        self.assertEqual(200, pending_status)
        self.assertEqual("validation_pending", pending["status"])
        self.assertNotIn("scheduling_capability", pending)
        self.assertEqual(403, scheduling_status)
        self.assertEqual("validation_required", scheduling["status"])
        self.assertEqual("verified", reverified["status"])
        self.assertNotEqual(
            verification["scheduling_capability"],
            reverified["scheduling_capability"],
        )

    def test_verified_session_capability_permits_deterministic_flow(self):
        demo_session_id = self.create_live_demo_session()
        status, _, partial = self.verify_live_demo_session(
            demo_session_id, "Jordan Lee"
        )
        self.assertEqual(200, status)
        self.assertEqual("validation_pending", partial["status"])
        self.assertNotIn("scheduling_capability", partial)

        _, _, wrong_persona = self.verify_live_demo_session(
            demo_session_id, "Alex Morgan, February 3, 1975"
        )
        self.assertEqual("validation_pending", wrong_persona["status"])

        _, _, verified = self.verify_live_demo_session(
            demo_session_id, "July 14, 1982"
        )
        self.assertEqual("verified", verified["status"])
        capability = verified["scheduling_capability"]
        self.assertNotEqual(demo_session_id, capability)

        authorization = {
            "demo_session_id": demo_session_id,
            "scheduling_capability": capability,
        }
        with patch.object(
            server,
            "mock_confirm_appointment_reschedule",
            side_effect=server.resolve_scheduling_request,
        ):
            options_status, _, options = self.post_json(
                "/api/demo-tools/confirm-appointment",
                {
                    **authorization,
                    "requested_window": "Friday morning",
                    "patient_name": "Injected Patient",
                    "facility": "Injected Facility",
                },
            )
            confirmed_status, _, confirmed = self.post_json(
                "/api/demo-tools/confirm-appointment",
                {
                    **authorization,
                    "requested_window": "Friday at 11:30 AM",
                    "selected_slot_id": "fri-1130",
                },
            )

        self.assertEqual(200, options_status)
        self.assertEqual("options_found", options["status"])
        self.assertEqual(["fri-1130"], [
            slot["slot_id"] for slot in options["available_slots"]
        ])
        self.assertEqual(200, confirmed_status)
        self.assertEqual("confirmed", confirmed["status"])
        self.assertEqual("Jordan Lee", confirmed["patient_name"])
        self.assertEqual("Northlake Imaging Center", confirmed["facility"])

    def test_empty_and_oversized_json_bodies_are_rejected(self):
        empty_status, _, _ = self.request(
            "/api/demo-tools/confirm-appointment",
            method="POST",
            data=b"",
            headers={"Content-Type": "application/json"},
        )
        oversized_status, oversized_headers, _ = self.request(
            "/api/demo-tools/confirm-appointment",
            method="POST",
            data=b"x" * (server.MAX_JSON_BODY_BYTES + 1),
            headers={"Content-Type": "application/json"},
        )

        self.assertEqual(400, empty_status)
        self.assertEqual(413, oversized_status)
        self.assertEqual("close", oversized_headers["Connection"])


class RealtimeSessionConstructionTests(unittest.TestCase):
    """The browser cannot redefine the realtime session; the server owns it."""

    def config(self):
        with patch.dict(
            os.environ,
            {
                "AZURE_OPENAI_ENDPOINT": "https://example.openai.azure.com",
                "AZURE_OPENAI_API_KEY": "test-key",
                "AZURE_OPENAI_REALTIME_DEPLOYMENT": "gpt-realtime-2.1",
            },
        ):
            return server.realtime_config()

    def test_session_uses_current_21_defaults(self):
        cfg = self.config()
        session = server.build_realtime_session(
            cfg, {"scenarioKey": "access"}, "instructions"
        )

        self.assertEqual("gpt-realtime-2.1", session["model"])
        self.assertEqual("marin", session["audio"]["output"]["voice"])
        self.assertEqual({"effort": "low"}, session["reasoning"])
        self.assertEqual(
            700,
            session["audio"]["input"]["turn_detection"]["silence_duration_ms"],
        )
        self.assertEqual([server.SCHEDULING_TOOL], session["tools"])

    def test_browser_session_update_excludes_immutable_fields(self):
        cfg = self.config()
        session = server.build_realtime_session(
            cfg, {"scenarioKey": "access"}, "instructions"
        )
        update = server.build_browser_session_update(session)

        self.assertNotIn("model", update)
        self.assertNotIn("reasoning", update)
        self.assertEqual(session["instructions"], update["instructions"])

    def test_scheduling_tools_are_absent_for_non_access_scenarios(self):
        cfg = self.config()
        session = server.build_realtime_session(
            cfg, {"scenarioKey": "revenue"}, "instructions"
        )

        self.assertNotIn("tools", session)

    def test_endpoint_must_resolve_to_https(self):
        cases = {
            "wss://demo.openai.azure.com/openai/v1/realtime?model=gpt-realtime-2.1": True,
            "demo.openai.azure.com": True,
            "https://demo.openai.azure.com/": True,
            "WSS://demo.openai.azure.com/openai/v1/realtime": True,
            "HTTPS://demo.openai.azure.com": True,
            "https://": False,
            "ws://demo.openai.azure.com/openai/v1/realtime": False,
            "http://demo.openai.azure.com": False,
        }
        for endpoint, secure in cases.items():
            with (
                self.subTest(endpoint=endpoint),
                patch.dict(
                    os.environ,
                    {
                        "AZURE_OPENAI_ENDPOINT": endpoint,
                        "AZURE_OPENAI_API_KEY": "test-key",
                        "AZURE_OPENAI_REALTIME_DEPLOYMENT": "gpt-realtime-2.1",
                    },
                ),
            ):
                cfg = server.realtime_config()
                self.assertEqual(secure, cfg["endpoint_secure"])
                self.assertEqual(secure, cfg["configured"])

    def test_endpoints_with_credentials_or_bad_ports_are_not_secure(self):
        for endpoint in (
            "https://user:pass@demo.openai.azure.com",
            "https://demo.openai.azure.com:notaport",
            "https://demo.openai.azure.com:99999",
            "http://demo.openai.azure.com",
            "",
        ):
            with self.subTest(endpoint=endpoint):
                self.assertFalse(server.is_secure_endpoint(endpoint))
        self.assertTrue(server.is_secure_endpoint("https://demo.openai.azure.com:443"))

    def config_with(self, **overrides):
        env = {
            "AZURE_OPENAI_ENDPOINT": "https://example.openai.azure.com",
            "AZURE_OPENAI_API_KEY": "test-key",
            "AZURE_OPENAI_REALTIME_DEPLOYMENT": "gpt-realtime-2.1",
            "REALTIME_TURN_DETECTION": "",
            "REALTIME_VAD_EAGERNESS": "",
            "REALTIME_NOISE_REDUCTION": "",
            **overrides,
        }
        with patch.dict(os.environ, env):
            return server.realtime_config()

    def test_default_turn_detection_is_unchanged_server_vad(self):
        session = server.build_realtime_session(
            self.config_with(), {"scenarioKey": "access"}, "instructions"
        )

        self.assertEqual(
            {
                "transcription": {"model": "whisper-1"},
                "turn_detection": {
                    "type": "server_vad",
                    "threshold": 0.35,
                    "prefix_padding_ms": 500,
                    "silence_duration_ms": 700,
                    "create_response": True,
                },
            },
            session["audio"]["input"],
        )

    def test_semantic_vad_and_noise_reduction_are_opt_in(self):
        cfg = self.config_with(
            REALTIME_TURN_DETECTION="semantic_vad",
            REALTIME_VAD_EAGERNESS="low",
            REALTIME_NOISE_REDUCTION="far_field",
        )
        session = server.build_realtime_session(cfg, {"scenarioKey": "access"}, "x")

        self.assertEqual(
            {
                "transcription": {"model": "whisper-1"},
                "turn_detection": {
                    "type": "semantic_vad",
                    "eagerness": "low",
                    "create_response": True,
                },
                "noise_reduction": {"type": "far_field"},
            },
            session["audio"]["input"],
        )

    def test_invalid_tuning_values_fall_back_to_defaults(self):
        cfg = self.config_with(
            REALTIME_TURN_DETECTION="magic",
            REALTIME_VAD_EAGERNESS="extreme",
            REALTIME_NOISE_REDUCTION="studio",
        )

        self.assertEqual("server_vad", cfg["turn_detection"])
        self.assertEqual("auto", cfg["vad_eagerness"])
        self.assertEqual("", cfg["noise_reduction"])

    def test_legacy_update_reproduces_the_former_browser_fallback(self):
        cfg = self.config_with(
            AZURE_OPENAI_REALTIME_PROTOCOL="legacy-webrtc",
            REALTIME_TURN_DETECTION="semantic_vad",
            REALTIME_NOISE_REDUCTION="near_field",
        )
        for scenario_key in ("access", "revenue", "multilingual"):
            with self.subTest(scenario=scenario_key):
                instructions = f"instructions for {scenario_key}"
                update = server.build_legacy_session_update(cfg, instructions)
                self.assertEqual(
                    {
                        "type": "realtime",
                        "instructions": instructions,
                        "tools": [],
                        "tool_choice": "auto",
                        "output_modalities": ["audio"],
                        "audio": {
                            "input": {
                                "transcription": {"model": "whisper-1"},
                                "turn_detection": {
                                    "type": "server_vad",
                                    "threshold": 0.35,
                                    "prefix_padding_ms": 500,
                                    "silence_duration_ms": 700,
                                    "create_response": True,
                                },
                            },
                            "output": {"voice": "marin"},
                        },
                    },
                    update,
                )

    def test_legacy_region_must_be_a_hostname_label(self):
        for region, valid in (
            ("eastus2", True),
            ("sweden-central", True),
            ("evil.example.com", False),
            ("eastus2/x", False),
            ("", False),
        ):
            with self.subTest(region=region):
                cfg = self.config_with(
                    AZURE_OPENAI_REALTIME_PROTOCOL="legacy-webrtc",
                    AZURE_OPENAI_REALTIME_REGION=region,
                )
                self.assertEqual(valid, cfg["region_valid"])
                self.assertEqual(valid, cfg["configured"])

    def test_client_secret_request_keeps_the_api_key_server_side(self):
        cfg = self.config()
        session = server.build_realtime_session(
            cfg, {"scenarioKey": "access"}, "instructions"
        )
        captured = {}

        class FakeResponse:
            def read(self):
                return json.dumps({"value": "ephemeral", "id": "sess_1"}).encode()

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

        def fake_urlopen(req, timeout=None):
            captured["headers"] = dict(req.headers)
            captured["body"] = json.loads(req.data.decode())
            return FakeResponse()

        with patch.object(server._API_KEY_OPENER, "open", fake_urlopen):
            data = server.request_ga_realtime_client_secret(cfg, session)

        self.assertEqual("ephemeral", data["value"])
        self.assertEqual({"session": session}, captured["body"])
        self.assertIn("test-key", captured["headers"].values())
        self.assertNotIn("test-key", json.dumps(captured["body"]))

    def test_api_key_requests_never_follow_redirects(self):
        from http.server import BaseHTTPRequestHandler

        received = []

        class RedirectHandler(BaseHTTPRequestHandler):
            def log_message(self, _format, *args):
                pass

            def do_POST(self):
                # Read the body first; Windows resets connections closed with unread input.
                self.rfile.read(int(self.headers.get("Content-Length", "0")))
                received.append((self.path, self.headers.get("api-key")))
                self.send_response(302)
                self.send_header("Location", "/leaked")
                self.send_header("Content-Length", "0")
                self.end_headers()

            do_GET = do_POST

        httpd = ThreadingHTTPServer(("127.0.0.1", 0), RedirectHandler)
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        try:
            cfg = {
                **self.config(),
                "endpoint": f"http://127.0.0.1:{httpd.server_port}",
            }
            for request_upstream in (
                lambda: server.request_ga_realtime_client_secret(cfg, {}),
                lambda: server.request_legacy_realtime_session(cfg),
            ):
                with self.assertRaises(HTTPError) as raised:
                    request_upstream()
                self.assertEqual(302, raised.exception.code)
                raised.exception.close()
        finally:
            httpd.shutdown()
            httpd.server_close()
            thread.join(timeout=5)

        self.assertEqual(2, len(received))
        self.assertEqual(["test-key", "test-key"], [key for _, key in received])
        self.assertNotIn("/leaked", [path for path, _ in received])


class SchedulingLatencyMetadataTests(unittest.TestCase):
    def test_mock_latency_metadata_matches_the_700ms_constant(self):
        self.assertEqual(0.7, server.MOCK_SCHEDULING_DELAY_SECONDS)
        self.assertEqual(700, server.MOCK_SCHEDULING_LATENCY_MS)

        with patch.object(server.time, "sleep") as sleep:
            result = server.mock_confirm_appointment_reschedule(
                {"requested_window": "Friday morning"}
            )

        sleep.assert_called_once_with(0.7)
        self.assertEqual(700, result["mock_latency_ms"])


if __name__ == "__main__":
    unittest.main()

class PortBindingTests(unittest.TestCase):
    def test_port_reuse_is_disabled_on_windows(self):
        self.assertEqual(os.name != "nt", server._ReusableServer.allow_reuse_address)

    def test_address_in_use_is_detected_across_platforms(self):
        import errno as errno_module

        class WinError(OSError):
            winerror = 10048

        self.assertTrue(server.is_address_in_use(OSError(errno_module.EADDRINUSE, "in use")))
        self.assertTrue(server.is_address_in_use(OSError(10048, "in use")))
        self.assertTrue(server.is_address_in_use(WinError(None, "in use")))
        self.assertFalse(server.is_address_in_use(OSError(errno_module.EACCES, "denied")))

    def test_second_server_on_a_busy_port_fails_instead_of_sharing_it(self):
        first = server.create_demo_server(0)
        port = first.server_address[1]
        second = None
        try:
            with self.assertRaises(OSError) as raised:
                second = server.create_demo_server(port)
            self.assertTrue(server.is_address_in_use(raised.exception))
        finally:
            first.server_close()
            if second is not None:
                second.server_close()

    def test_port_hint_matches_the_platform(self):
        hint = server.port_in_use_hint(8787)
        self.assertIn("8787", hint)
        self.assertIn("Get-NetTCPConnection" if os.name == "nt" else "lsof", hint)
