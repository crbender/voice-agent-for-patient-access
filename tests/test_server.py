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
                    "AZURE_OPENAI_REALTIME_DEPLOYMENT": "gpt-realtime-2",
                    "AZURE_OPENAI_REALTIME_PROTOCOL": "ga-webrtc",
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
        status, headers, _ = self.request("/")

        self.assertEqual(200, status)
        self.assertIn(
            "connect-src 'self' https:", headers["Content-Security-Policy"]
        )
        self.assertEqual("microphone=(self)", headers["Permissions-Policy"])
        self.assertEqual("nosniff", headers["X-Content-Type-Options"])

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
        status, _, _ = self.request(
            "/api/demo-tools/confirm-appointment",
            method="POST",
            data=body,
            headers={
                "Content-Type": "application/json",
                "Origin": "https://example.com",
            },
        )

        self.assertEqual(403, status)

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
        status, _, _ = self.request(
            "/api/demo-tools/confirm-appointment",
            method="POST",
            data=b"{}",
            headers={"Content-Type": "text/plain"},
        )

        self.assertEqual(415, status)

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


if __name__ == "__main__":
    unittest.main()
