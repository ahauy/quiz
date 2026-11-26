interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email" | "password" | undefined;
  error?: string | undefined;
  autoComplete?: string | undefined;
  placeholder?: string | undefined;
}

export function TextField(props: TextFieldProps) {
  const { id, label, value, onChange, type = "text", error } = props;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={props.autoComplete}
        placeholder={props.placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="rounded-md border border-gray-400 px-3 py-2 text-sm aria-[invalid=true]:border-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-red-600">{error}</p>
      ) : null}
    </div>
  );
}

export function FormAlert({
  message,
  tone = "error",
}: {
  message: string;
  tone?: "error" | "success" | undefined;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={tone === "error" ? "text-sm text-red-600" : "text-sm text-green-700"}
    >
      {message}
    </p>
  );
}
