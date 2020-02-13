# Failing network on the server

Example text:

```
Room Service can't access the auth endpoint on the server.
```

## Why this error is happening

Room Service can't access your auth endpoint when attempting to render on the server (SSR).

## How to fix this

The **most likely case** is that your auth endpoint isn't setup correctly. Please confirm that:

1. You've made an [auth endpoint](https://www.roomservice.dev/docs/auth).
2. Your auth endpoint has a valid API key.
3. Your auth endpoint itself isn't logging any errors.
