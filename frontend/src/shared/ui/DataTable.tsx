import { Table } from "@mantine/core";
import type { CSSProperties, ReactNode } from "react";

interface DataTableProps {
  minWidth?: number;
  label?: string;
  style?: CSSProperties;
  children: ReactNode;
}

export function DataTable({ minWidth = 760, label = "Tabela de dados", style, children }: DataTableProps) {
  return (
    <Table.ScrollContainer
      className="data-table-card"
      minWidth={minWidth}
      scrollAreaProps={{ viewportProps: { tabIndex: 0, role: "region", "aria-label": label } }}
      style={style}
    >
      <Table className="ds-table">{children}</Table>
    </Table.ScrollContainer>
  );
}
