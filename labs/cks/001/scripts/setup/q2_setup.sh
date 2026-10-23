#!/bin/bash
# Setup for Question 2: TLS-Enabled Ingress

# Create namespace if it doesn't exist
kubectl create namespace secure-ingress 2>/dev/null || true

# Create a web service
kubectl apply -f - <<EOF
apiVersion: v1
kind: Service
metadata:
  name: web-service
  namespace: secure-ingress
spec:
  selector:
    app: web
  ports:
  - port: 80
    targetPort: 80
EOF

# Create a deployment for the web service
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-deployment
  namespace: secure-ingress
spec:
  replicas: 1
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
      - name: nginx
        image: nginx
        ports:
        - containerPort: 80
EOF

# Create a TLS secret to be used in the Ingress
kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: secure-app-tls
  namespace: secure-ingress
type: kubernetes.io/tls
data:
  tls.crt: $(cat <<'EOT' | base64 -w 0
-----BEGIN CERTIFICATE-----
MIIDazCCAlOgAwIBAgIUOX75BZ3gP92zRT89ZC6OJ0lJMd8wDQYJKoZIhvcNAQEL
BQAwRTELMAkGA1UEBhMCQVUxEzARBgNVBAgMClNvbWUtU3RhdGUxITAfBgNVBAoM
GEludGVybmV0IFdpZGdpdHMgUHR5IEx0ZDAeFw0yMzA3MTYxMzAyMzBaFw0yNDA3
MTUxMzAyMzBaMEUxCzAJBgNVBAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEw
HwYDVQQKDBhJbnRlcm5ldCBXaWRnaXRzIFB0eSBMdGQwggEiMA0GCSqGSIb3DQEB
AQUAA4IBDwAwggEKAoIBAQDIEVc+UZ2JOkCAW9Kx92IZm9M9txOlR8TlN5QzkvQj
rR5lHyJ6KO+MzLH8qOvHkZ8xx/GH+m4Wl8aZP8W4wZMSslKW6O0rUHnDfXH+0OyE
bEHBz2PZqqJKHQZ0/lQQVV7yZh0KOT/zgCOnPS6huK8Vl9ePGgGV/2D9CQXlTFpY
8MZELjZ3ms0oj6k7AcuOX9COqfKB13kP6PMwRuhW66cEXXC3PH9aWznRTJRKyWYi
Z0V6MHwhgksd7J1ZwTmxNDnJfuYgR9LO4EnLLbO9HpiS0k7YeLe6Jxn7tS7MIIcj
BktWe6TLYxU8PRoWO/aOPGBQH1D6RSQrDQN0QkZbAgMBAAGjUzBRMB0GA1UdDgQW
BBTu0KY0n39dym6AQGhGISvVTRTtXTAfBgNVHSMEGDAWgBTu0KY0n39dym6AQGhG
ISvVTRTtXTAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQCfLHNF
5JoY1DYwbVzJZTw0wjTfdWqQrjvYfVPgfJ34fvBZoKHa1oOKI8JrBTZjClSdL0Ui
n1rT8bvAxrZDpBapwLM4zm8Bjd2MzMfpO0eKQM8ZoQrMTK/37/nFfMRH9qMKgxB1
UQzKvALrWxJOhiOHoYBD0/aRnC9dSJixq5Qp9TQdTvCqbKYJxB1tGMDhX6yvWUTw
MxYPJZVZclFYvzC9KWsKvhn231dZKVDUXNJjnCS4w8bsGNB9Vh7b/Giu8pXZH46p
oeD/vN+iz92lKkHvhJIImtHrMd7QVEaNrNqM7xVR/c+gTzXhEzMlguIvu1TKrzRl
xfvbMUhP0qBfrFvP
-----END CERTIFICATE-----
EOT
)
  tls.key: $(cat <<'EOT' | base64 -w 0
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDIEVc+UZ2JOkCA
W9Kx92IZm9M9txOlR8TlN5QzkvQjrR5lHyJ6KO+MzLH8qOvHkZ8xx/GH+m4Wl8aZ
P8W4wZMSslKW6O0rUHnDfXH+0OyEbEHBz2PZqqJKHQZ0/lQQVV7yZh0KOT/zgCOn
PS6huK8Vl9ePGgGV/2D9CQXlTFpY8MZELjZ3ms0oj6k7AcuOX9COqfKB13kP6PMw
RuhW66cEXXC3PH9aWznRTJRKyWYiZ0V6MHwhgksd7J1ZwTmxNDnJfuYgR9LO4EnL
LbO9HpiS0k7YeLe6Jxn7tS7MIIcjBktWe6TLYxU8PRoWO/aOPGBQH1D6RSQrDQN0
QkZbAgMBAAECggEAQ/aaJA7dLFSgc6M5is2hLTQTD2OuL1rxuMWbX0YZDuQMzFc6
Xf9zEJFB1SIrWMbwKxQm/Lx4R8aR2ldd8JtH+5uLVwfPYQvIkKAXtJpGh5RJqm9Y
lbnkC7HcpJPa0fXRHsKQcltmPFExWMlFkERz05VNRqOoNrWCzHnZ2z9byaClIyhW
XWvw0NlH/YQYvEZeyBPRjlQTArWKSZv4Ug2U7DFG8HzXVQ8F6iLJ3jFbZO/HrICQ
r+S/+Yw3EmoVN5JeO1PkZiVDjlftcMRCS3LE2t4UR0Q3eH6tdiXCQhaBZSMj1yRY
vQrGt6S2L0o4Ac4IWPC6f3U4a4wZwUqX/WTtOv5OgQKBgQDkPFYu+cxo/l2q/Ueg
jCVMzgLSABFgdf3FdQ1yxCZ59GvYd3OM0QnhYYQ6jDVbKEAuNPNqdGaC5Qw25gYp
Yq6gFcfwDOlJk9EUQNEe01CzqUkxFHO3cVMZiwUXeJhD5sNCxTV+qKmBYBgT6TrI
B8OZ+tHVyQ/Cacuk9ROS0XLn6QKBgQDgUpW96ztmQpQO2YOXJrBJFD7534RLA3U2
Jw1mqah7+X0X5U0FhkbKJzSFtgHJAY7JLUYf7mNy80PKJcpRKzJu5QNQSz36sLT/
Y1tQNGdaLQ/BXRYjFHPn2RPXSm73yNUWbD3GQBJwfQiZhxKCYiIrDcpYvnEZTOeq
37HYQoN6MwKBgDAKbxwMUUoN2/Wn8QU8TsVipEqsMRBQMaQA3/NT4GxfQwrntUCt
KJwrxSZVakfdHskFwGLGpY158M+9Hky5rjP4K4lF9FTh8RYylMPL6vQUcA7AO2XP
nNOz3hU6N9+A3kbKgWmbNFNRh7SkKvKqZhPK+12hQWJ10GQKYPGlj5YpAoGBAKkL
LwNKfGrJo5WclEh+dR3bzCIjqjQs1Qn8q/J/LxNjeVXCdMGLm1aCVvXBvxnXX+XV
AYi0qPIZ++CywO8aqH24FBrYBMDYXkz5YJMnRBxeS5WCUjGxFKEWY63b3jyKTRjF
4DJ9Qi4prJVQ01cYWJsYCSCrLRMZcS50Q4Ly9+wHAoGAecWzka9+WI8gvQfZu7wX
8B5YQJ2gmvRbAL+JbEeiJ6+PDEolToLGzEXbYh8zBG+hmLrZn+jvH54k1RcqWX8C
TuE07Aa/f9XKzrAr39GCBUZ9qoIRVt7JNJolNmfRXr5wixmTQQhRcUJ9WDaTYDYl
fNU4PpR4tV6a//1GxUztYbw=
-----END PRIVATE KEY-----
EOT
)
EOF

echo "Setup completed for Question 2"
exit 0 