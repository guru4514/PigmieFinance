import { useState } from "react";
import { z } from "zod";
import { apiClient } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { toast } from "sonner";

export function CollectionEvidenceButton({
  collectionId,
}: {
  collectionId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string>();
  async function load() {
    setUrl(undefined);
    setBusy(true);
    try {
      const documents = z
        .array(z.object({ id: z.string().uuid(), documentType: z.string() }))
        .parse(
          (await apiClient.get(`/documents/entity/collection/${collectionId}`))
            .data,
        );
      const photo = documents.find(
        (document) => document.documentType === "collection_photo",
      );
      if (!photo) {
        toast.info("No private photo is attached to this collection.");
        return;
      }
      const grant = z
        .object({ signedUrl: z.string().url() })
        .parse(
          (await apiClient.get(`/documents/${photo.id}/download-url`)).data,
        );
      if (new URL(grant.signedUrl).protocol !== "https:")
        throw new Error("Invalid photo grant");
      setUrl(grant.signedUrl);
    } catch {
      toast.error("Could not authorize this photo. Try again when connected.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => void load()}
      >
        {busy ? "Loading…" : "Photo"}
      </Button>
      <Dialog
        open={!!url}
        onOpenChange={(open) => {
          if (!open) setUrl(undefined);
        }}
      >
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Collection photo</DialogTitle>
          {url && (
            <img
              src={url}
              alt="Collection evidence"
              className="max-h-[80vh] max-w-full object-contain"
              referrerPolicy="no-referrer"
              onError={() => {
                setUrl(undefined);
                toast.error(
                  "Photo access expired or failed. Open it again to retry.",
                );
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
