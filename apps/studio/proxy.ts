import { type NextRequest, NextResponse } from "next/server";
import { createLogger } from "~/lib/logger";

/** Paths a browser polls on a timer; one log line per poll would drown the real traffic. */
const POLLED_PATHS = new Set(["/api/formlens-status"]);

export function proxy(request: NextRequest) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  // Create a logger with request context
  const requestLogger = createLogger({
    method: request.method,
    requestId,
    url: request.url,
    userAgent: request.headers.get("user-agent")
  });

  const level = POLLED_PATHS.has(request.nextUrl.pathname) ? "debug" : "info";

  requestLogger[level]("Incoming request");

  // Continue with the request
  const response = NextResponse.next();

  // Add request ID to response headers
  response.headers.set("X-Request-ID", requestId);

  // Log the response
  const duration = Date.now() - startTime;
  void requestLogger
    .withMetadata({
      duration,
      status: response.status
    })
    [level]("Request completed");

  return response;
}

// Configure which routes to run proxy on
export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)"
  ]
};
