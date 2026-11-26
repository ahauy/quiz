import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button.js";
import { FormAlert, TextField } from "@/components/ui/field.js";
import { createClassroom } from "@/lib/classroom-api.js";
import { createClassroomSchema, fieldErrors, getErrorMessage } from "@/lib/forms.js";
import type { Classroom } from "@/lib/schemas.js";

interface CreateClassroomDialogProps {
  onCreated: (classroom: Classroom) => void;
}

export function CreateClassroomDialog({ onCreated }: CreateClassroomDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLFormElement>(null);

  // Inline disclosure (not a modal): move focus to the panel so keyboard users land in the form.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Escape") setOpen(false);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    const parsed = createClassroomSchema.safeParse({ name });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const classroom = await createClassroom({ name: parsed.data.name });
      onCreated(classroom);
      setName("");
      setOpen(false);
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Button type="button" onClick={() => setOpen(true)}>Tạo lớp học</Button>
      {open ? (
        <form
          ref={panelRef}
          tabIndex={-1}
          aria-labelledby="create-classroom-heading"
          data-testid="create-classroom-dialog"
          onSubmit={(event) => void onSubmit(event)}
          onKeyDown={onKeyDown}
          noValidate
          className="mt-3 flex max-w-md flex-col gap-3 rounded-md border border-gray-300 p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <h2 id="create-classroom-heading" className="text-base font-medium">Tạo lớp học mới</h2>
          <TextField
            id="classroomName"
            label="Tên lớp"
            value={name}
            onChange={setName}
            error={errors.name}
          />
          {formError ? <FormAlert message={formError} /> : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>Tạo lớp</Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Hủy</Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
