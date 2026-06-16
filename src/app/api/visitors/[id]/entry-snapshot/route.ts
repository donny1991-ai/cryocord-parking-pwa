import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { authErrorResponse, requireParkingUser } from "@/lib/server/auth";
import { invalidateParkingReadModelCache } from "@/lib/server/parking-cache";
import { EntrySnapshotNotEligibleError, captureVisitorEntrySnapshot } from "@/lib/server/entry-snapshots";
import {
  ENTRY_SNAPSHOT_ALLOWED_TYPES,
  ENTRY_SNAPSHOT_MAX_BYTES,
  EntrySnapshotStorageConfigError,
} from "@/lib/server/entry-snapshot-storage";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  let visitorId = "unknown";
  let actorId: string | undefined;

  try {
    const actor = await requireParkingUser(request);
    actorId = actor.id;
    const { id } = await params;
    visitorId = id;
    const body = await request.formData();
    const snapshot = body.get("snapshot");

    if (!(snapshot instanceof File)) {
      return jsonWithRequestId({ error: "Entry snapshot image is required.", requestId }, 400, requestId);
    }

    if (!(ENTRY_SNAPSHOT_ALLOWED_TYPES as readonly string[]).includes(snapshot.type)) {
      return jsonWithRequestId({ error: "Entry snapshot must be a JPEG, PNG, or WebP image.", requestId }, 400, requestId);
    }

    if (snapshot.size > ENTRY_SNAPSHOT_MAX_BYTES) {
      return jsonWithRequestId({ error: "Entry snapshot must be 4 MB or smaller.", requestId }, 400, requestId);
    }

    const result = await captureVisitorEntrySnapshot({
      visitorId: id,
      actor,
      bytes: new Uint8Array(await snapshot.arrayBuffer()),
      contentType: snapshot.type,
    });

    await invalidateParkingReadModelCache();
    revalidateVisitorPages(id);
    return jsonWithRequestId({ snapshot: result, requestId }, 201, requestId);
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) {
      return jsonWithRequestId({ error: authError.error, requestId }, authError.status, requestId);
    }

    if (error instanceof EntrySnapshotStorageConfigError) {
      logEntrySnapshotError(error, { requestId, visitorId, actorId, status: 503 });
      return jsonWithRequestId({ error: error.message, requestId }, 503, requestId);
    }

    if (error instanceof EntrySnapshotNotEligibleError) {
      return jsonWithRequestId({ error: error.message, requestId }, 409, requestId);
    }

    const message = error instanceof Error ? error.message : "Unable to save entry snapshot.";
    if (
      message.includes("entry_photo_") ||
      message.includes("entry photo") ||
      message.includes("visitor_entry_snapshots")
    ) {
      logEntrySnapshotError(error, { requestId, visitorId, actorId, status: 503 });
      return jsonWithRequestId(
        { error: "Entry snapshot database migration has not been applied.", requestId },
        503,
        requestId,
      );
    }
    if (message.includes("not found")) {
      return jsonWithRequestId({ error: message, requestId }, 404, requestId);
    }
    if (
      message.includes("JPEG") ||
      message.includes("PNG") ||
      message.includes("WebP") ||
      message.includes("4 MB") ||
      message.includes("private")
    ) {
      return jsonWithRequestId({ error: message, requestId }, 400, requestId);
    }

    logEntrySnapshotError(error, { requestId, visitorId, actorId, status: 500 });
    return jsonWithRequestId({ error: "Unable to save entry snapshot.", requestId }, 500, requestId);
  }
}

function jsonWithRequestId(body: Record<string, unknown>, status: number, requestId: string) {
  return NextResponse.json(body, {
    status,
    headers: {
      "x-request-id": requestId,
    },
  });
}

function logEntrySnapshotError(
  error: unknown,
  context: {
    requestId: string;
    visitorId: string;
    actorId?: string;
    status: number;
  },
) {
  const errorDetails = error instanceof Error
    ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      }
    : {
        name: "UnknownError",
        message: String(error),
      };

  console.error("[entry-snapshot] request failed", {
    ...context,
    ...errorDetails,
  });
}

function revalidateVisitorPages(visitorId: string) {
  try {
    revalidatePath("/parking");
    revalidatePath("/parking/admin");
    revalidatePath("/parking/visits");
    revalidatePath(`/parking/visit/${visitorId}`);
  } catch {
    // Direct test invocation does not always provide Next's static generation store.
  }
}
