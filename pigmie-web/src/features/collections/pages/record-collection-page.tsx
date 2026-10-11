import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { MapPin, Camera, AlertCircle } from "lucide-react";

const collectionSchema = z.object({
  amount: z.number().positive("Amount must be greater than zero"),
  collectionMethod: z.enum(["cash", "cheque", "other"]),
  notes: z.string().optional(),
});

type RecordCollectionInput = z.infer<typeof collectionSchema>;

import { useParams, useNavigate } from "react-router-dom";
import { useRecordCollection } from "../hooks/use-collections";
import { useOnlineStatus } from "@/shared/hooks/use-online-status";
import { usePendingCollections } from "@/shared/hooks/use-pending-collections";
import { readCollectionPhoto } from "@/shared/lib/collection-photo";
import type { CollectionInput } from "@/shared/lib/offline-queue";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export function RecordCollectionPage() {
  const { t } = useTranslation();
  const { loanId } = useParams<{ loanId: string }>();
  const navigate = useNavigate();
  const { mutateAsync: recordCollection } = useRecordCollection(loanId);
  const { pendingCollections, queueError, queueLoading } =
    usePendingCollections();
  const hasPendingCollection = pendingCollections.some(
    (item) => item.loanId === loanId,
  );

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RecordCollectionInput>({
    resolver: zodResolver(collectionSchema),
    defaultValues: { amount: 0, collectionMethod: "cash" },
  });

  const { isOnline } = useOnlineStatus();
  const [status, setStatus] = useState<
    "idle" | "success" | "pending" | "error"
  >("idle");
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const submitting = React.useRef(false);

  const handleCaptureLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          toast.success("Location captured");
        },
        (error) => toast.error("Failed to capture location: " + error.message),
      );
    } else {
      toast.error("Geolocation is not supported by this browser.");
    }
  };

  const handleCapturePhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoUrl(reader.result as string);
        toast.success("Photo captured");
      };
      reader.readAsDataURL(file);
    }
  };

  const onSubmit = handleSubmit(async (data) => {
    if (
      !loanId ||
      hasPendingCollection ||
      queueError ||
      queueLoading ||
      submitting.current
    )
      return;
    submitting.current = true;
    setStatus("idle");
    try {
      const collection: CollectionInput = {
        clientGeneratedId: crypto.randomUUID(),
        loanId,
        amount: data.amount,
        collectionDate: new Date(
          new Date().getTime() - new Date().getTimezoneOffset() * 60000,
        )
          .toISOString()
          .split("T")[0],
        collectedAt: new Date().toISOString(),
        collectionMethod: data.collectionMethod,
        notes: data.notes,
        ...(location
          ? { latitude: location.latitude, longitude: location.longitude }
          : {}),
        ...(photoFile
          ? { offlinePhotoBase64: await readCollectionPhoto(photoFile) }
          : {}),
      };
      const result = await recordCollection(collection);
      if (result.status === "recorded") {
        setStatus("success");
        toast.success("Collection recorded successfully");
      } else {
        setStatus("pending");
        toast.info(
          "Saved on this device. Pending sync — do not record this payment again.",
        );
      }
      navigate(`/app/loans/${loanId}`);
    } catch (error: unknown) {
      setStatus("error");
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not save the collection. Please retry.",
      );
    } finally {
      submitting.current = false;
    }
  });

  return (
    <div className="container mx-auto p-4 max-w-md">
      <Card className="glassmorphism bg-card/50 backdrop-blur-md border-border dark:text-foreground">
        <CardHeader>
          <CardTitle className="text-2xl font-bold flex items-center justify-between">
            {t("recordCollection.title")}
            {!isOnline && (
              <span className="text-xs bg-amber-500/20 text-amber-500 px-2 py-1 rounded-full flex items-center gap-1">
                <AlertCircle size={14} /> {t("recordCollection.offlineMode")}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-6">
            {(queueError || hasPendingCollection) && (
              <p
                role="alert"
                className="text-sm text-amber-600 dark:text-amber-400"
              >
                {queueError ||
                  "A collection for this loan is already saved on this device. Sync it from Today’s Collections before recording another payment."}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="amount">
                {t("recordCollection.amountLabel")}
              </Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                {...register("amount", { valueAsNumber: true })}
                className="text-lg bg-background/50 border-border focus:border-primary/50"
              />
              {errors.amount && (
                <p className="text-destructive text-sm">
                  {errors.amount.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="collectionMethod">
                {t("recordCollection.method")}
              </Label>
              <Select
                defaultValue="cash"
                onValueChange={(val: any) => setValue("collectionMethod", val)}
              >
                <SelectTrigger className="bg-background/50 border-border">
                  <SelectValue
                    placeholder={t("recordCollection.selectMethod")}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">
                    {t("recordCollection.cash")}
                  </SelectItem>
                  <SelectItem value="cheque">
                    {t("recordCollection.cheque")}
                  </SelectItem>
                  <SelectItem value="other">
                    {t("recordCollection.other")}
                  </SelectItem>
                </SelectContent>
              </Select>
              {errors.collectionMethod && (
                <p className="text-destructive text-sm">
                  {errors.collectionMethod.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">{t("recordCollection.notesLabel")}</Label>
              <Input
                id="notes"
                {...register("notes")}
                placeholder={t("recordCollection.notesPlaceholder")}
                className="bg-background/50 border-border"
              />
            </div>

            <div className="flex gap-2 pt-2 flex-col">
              <div className="flex gap-2">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleCapturePhoto}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 bg-muted border-border hover:bg-muted"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera className="w-4 h-4 mr-2" />
                  {photoUrl
                    ? t("recordCollection.photoCaptured")
                    : t("recordCollection.photo")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 bg-muted border-border hover:bg-muted"
                  onClick={handleCaptureLocation}
                >
                  <MapPin className="w-4 h-4 mr-2" />
                  {location
                    ? t("recordCollection.locationCaptured")
                    : t("recordCollection.location")}
                </Button>
              </div>
              {location && (
                <div className="text-xs text-muted-foreground text-center">
                  {t("recordCollection.coordinates")}:{" "}
                  {(location.latitude || 0).toFixed(6)},{" "}
                  {(location.longitude || 0).toFixed(6)}
                </div>
              )}
            </div>

            <Button
              type="submit"
              className="w-full font-semibold"
              disabled={
                isSubmitting ||
                hasPendingCollection ||
                !!queueError ||
                queueLoading
              }
            >
              {isSubmitting
                ? t("collection.saving")
                : t("recordCollection.title")}
            </Button>

            {status === "success" && (
              <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-md text-sm text-center">
                {t("recordCollection.successMsg")}{" "}
                {isOnline ? "" : t("recordCollection.syncMsg")}
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
