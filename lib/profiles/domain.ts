type VisibilityOptions = {
  isOwner: boolean;
};

type AvatarPathOptions = {
  userId: string;
  fileName: string;
  randomId: () => string;
};

const supportedAvatarTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

export function getProfilePostVisibilityFilter({ isOwner }: VisibilityOptions) {
  if (isOwner) {
    return { includeDrafts: true };
  }

  return { includeDrafts: false, status: "published" as const };
}

export function isSupportedAvatarFile(contentType: string) {
  return supportedAvatarTypes.has(contentType);
}

export function getPublicAvatarPath({
  userId,
  fileName,
  randomId,
}: AvatarPathOptions) {
  const extension = fileName.split(".").pop()?.toLowerCase() || "bin";
  return `${userId}/${randomId()}.${extension}`;
}
