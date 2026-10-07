import { Text, Title } from "@mantine/core";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        <Title order={2}>{title}</Title>
        {subtitle && (
          <Text c="dimmed" size="sm">
            {subtitle}
          </Text>
        )}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}
