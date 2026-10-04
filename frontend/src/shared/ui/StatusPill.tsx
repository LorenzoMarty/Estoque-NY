import { Badge } from "@mantine/core";
import type { ReactNode } from "react";
import { statusTones, type StatusTone } from "../../app/theme";

interface StatusPillProps {
  tone: StatusTone;
  children: ReactNode;
}

export function StatusPill({ tone, children }: StatusPillProps) {
  return (
    <Badge className="status-pill" color={statusTones[tone]} data-tone={tone} fw={600} tt="none">
      {children}
    </Badge>
  );
}
