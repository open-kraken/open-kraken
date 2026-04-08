/** Max raw file size before base64 (≈3.3MB when encoded). */
export const CHAT_ATTACHMENT_MAX_BYTES = 2_500_000;

export type PendingChatAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'file';
  dataUrl: string;
};

export type ChatAttachmentPayload = {
  kind: 'image' | 'file';
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
};

const randomId = () => `att_${Math.random().toString(36).slice(2, 12)}`;

export const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('read_failed'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('read_failed'));
    reader.readAsDataURL(file);
  });

export const fileToPendingAttachment = async (file: File): Promise<PendingChatAttachment> => {
  if (file.size > CHAT_ATTACHMENT_MAX_BYTES) {
    throw new Error('file_too_large');
  }
  const dataUrl = await readFileAsDataUrl(file);
  const isImage = file.type.startsWith('image/');
  return {
    id: randomId(),
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    kind: isImage ? 'image' : 'file',
    dataUrl
  };
};

export const pendingToPayload = (p: PendingChatAttachment): ChatAttachmentPayload => ({
  kind: p.kind,
  name: p.name,
  mimeType: p.mimeType,
  size: p.size,
  dataUrl: p.dataUrl
});
