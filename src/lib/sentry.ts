import * as Sentry from "@sentry/react";

// Errors only. No session replay or tracing: the UI shows vault contents,
// and nothing beyond a stack trace should ever leave the device.
Sentry.init({
  dsn: "https://6244afaac244840716bff8ede3b79abd@o4512243517161472.ingest.de.sentry.io/4512243524960336",
  enabled: import.meta.env.PROD,
  environment: import.meta.env.MODE,
  release: `keyra-app@${__APP_VERSION__}`,
  // Console, click and fetch breadcrumbs can carry vault data (titles, URLs, logged values).
  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.category === "console" || breadcrumb.category?.startsWith("ui.")) return null;
    return breadcrumb;
  },
  beforeSend(event) {
    delete event.user;
    if (event.request) delete event.request.headers;
    return event;
  },
});
