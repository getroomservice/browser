# Failing network on the server

Example text:

```
Room Service can't access the auth endpoint.
```

## Why this error is happening

Your auth endpoint isn't setup correctly.

## How to fix this

Please confirm that:

1. You've made an [auth endpoint](https://www.roomservice.dev/docs/auth).
2. Your auth endpoint has a valid API key.
3. Your auth endpoint itself isn't logging any errors.
4. Your auth endpoint is pointed to the correct domain, for example, ensure it's not pointing to `localhost:3000` while running in production.
