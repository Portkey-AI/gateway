# Error Catalog (Phase 1)

This document lists the standardized error codes introduced in Phase 1 of the Error Handling improvement project.

## Error Format

All errors return a JSON response in the following format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

## Error Codes

| Error Code | HTTP Status | Description |
| :--- | :--- | :--- |
| `INVALID_CONTENT_TYPE` | 400 | The `Content-Type` header must be `application/json` or `multipart/form-data`. |
| `MISSING_REQUIRED_HEADER` | 400 | Either `x-portkey-provider` or `x-portkey-config` header is missing. |
| `INVALID_PROVIDER` | 400 | The specified provider in `x-portkey-provider` is not supported. |
| `INVALID_CUSTOM_HOST` | 400 | The `x-portkey-custom-host` header contains an invalid or blocked URL. |
| `INVALID_CONFIG` | 400 | The `x-portkey-config` header contains invalid JSON or fails schema validation. |
| `UNSUPPORTED_CONFIG_VERSION`| 400 | The config version provided is no longer supported (e.g., using `options` key). |
| `MISSING_PROVIDER_IN_CONFIG`| 400 | The config object is valid JSON but missing the required `provider` or `targets` fields. |
| `PROVIDER_AUTHENTICATION_ERROR` | 401 | The provider rejected the request due to invalid credentials (API key). |
| `PROVIDER_NOT_FOUND` | 404 | The requested resource (model, endpoint) was not found at the provider. |
| `PROVIDER_RATE_LIMIT` | 429 | The provider's rate limit has been exceeded. |
| `PROVIDER_TIMEOUT` | 408 | The request to the provider timed out. |
| `PROVIDER_INTERNAL_ERROR` | 500 | The provider encountered an internal server error. |
| `PROVIDER_BAD_REQUEST` | 400 | The provider rejected the request due to invalid parameters. |
| `NO_HEALTHY_TARGETS` | 500 | No healthy targets found to process the request (e.g., all targets exhausted or failed). |
| `GATEWAY_TIMEOUT` | 504 | The Gateway timed out while processing the request. |
| `GATEWAY_INTERNAL_ERROR` | 500 | The Gateway encountered an internal error. |


