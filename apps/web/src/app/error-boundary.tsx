import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Uncaught UI error", error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return <div role="alert">Đã có lỗi. Vui lòng tải lại trang.</div>;
    }
    return this.props.children;
  }
}
