export function readCollectionPhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/"))
    return Promise.reject(
      new Error("Select an image for the collection photo."),
    );
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Could not read the collection photo."));
    reader.onerror = () =>
      reject(new Error("Could not read the collection photo."));
    reader.onabort = () =>
      reject(new Error("Reading the collection photo was cancelled."));
    reader.readAsDataURL(file);
  });
}
