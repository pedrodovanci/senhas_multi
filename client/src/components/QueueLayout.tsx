import type { ReactNode } from "react";
import "./QueueLayout.css";

interface QueueLayoutProps {
  children?: ReactNode;
  headerContent?: ReactNode;
}

export default function QueueLayout({ children, headerContent }: QueueLayoutProps) {
  return (
    <div className="queue-screen">
      <div className="header">{headerContent}</div>

      <div className="shape shape-primary"></div>
      <div className="shape shape-secondary"></div>

      <div className="content">{children}</div>
    </div>
  );
}
