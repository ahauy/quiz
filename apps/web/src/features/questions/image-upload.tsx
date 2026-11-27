import { useRef, useState } from "react";
import { ApiError } from "@/lib/api-client.js";
import { FormAlert } from "@/components/ui/field.js";
import { apiErrorMessage, uploadImage } from "./api.js";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB (BR-QB-015)
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

interface ImageUploadProps {
  onInsert: (markdown: string) => void;
}

function uploadErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 413:
        return "Ảnh vượt quá 5 MB. Vui lòng chọn ảnh nhỏ hơn.";
      case 415:
        return "Định dạng ảnh không được hỗ trợ (chỉ PNG, JPEG, WebP, GIF hợp lệ).";
      case 422:
        return "Tệp không hợp lệ hoặc rỗng.";
      default:
        return apiErrorMessage(error);
    }
  }
  return apiErrorMessage(error);
}

export function ImageUpload({ onInsert }: ImageUploadProps) {
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File): Promise<void> {
    setError(null);
    setSuccess(null);
    if (file.size === 0) {
      setError("Tệp rỗng, vui lòng chọn ảnh khác.");
      return;
    }
    if (file.size > MAX_SIZE) {
      setError("Ảnh vượt quá 5 MB. Vui lòng chọn ảnh nhỏ hơn.");
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
      setError("Chỉ chấp nhận ảnh PNG, JPEG, WebP hoặc GIF.");
      return;
    }

    setPending(true);
    setProgress(0);
    try {
      const result = await uploadImage(file, setProgress);
      const alt = file.name.replace(/[\[\]()]/g, "").trim() || "Ảnh minh họa";
      onInsert(`![${alt}](${result.url})`);
      setSuccess("Đã tải ảnh lên và chèn vào nội dung.");
    } catch (caught) {
      setError(uploadErrorMessage(caught));
    } finally {
      setPending(false);
      if (inputRef.current !== null) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1" aria-busy={pending}>
      <label htmlFor="question-image-upload" className="text-sm font-medium">
        Thêm ảnh vào nội dung
      </label>
      <input
        ref={inputRef}
        id="question-image-upload"
        type="file"
        accept={ALLOWED_TYPES.join(",")}
        disabled={pending}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file !== undefined) void handleFile(file);
        }}
        className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-gray-400 file:bg-white file:px-3 file:py-2 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      />
      <p className="text-xs text-gray-600">
        Tối đa 5 MB · PNG / JPEG / WebP / GIF. Ảnh được chèn tại con trỏ trong nội dung.
      </p>
      {pending ? (
        <div role="status" aria-live="polite" className="flex flex-col gap-1">
          <progress
            value={progress}
            max={100}
            aria-label="Tiến độ tải ảnh"
            className="w-full"
          />
          <span className="text-xs text-gray-600">Đang tải ảnh… {progress}%</span>
        </div>
      ) : null}
      {error !== null ? <FormAlert message={error} /> : null}
      {success !== null ? <FormAlert message={success} tone="success" /> : null}
    </div>
  );
}
