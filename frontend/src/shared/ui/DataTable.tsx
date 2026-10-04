import { Table } from "@mantine/core";
import type { CSSProperties, ReactNode } from "react";

interface DataTableProps {
  minWidth?: number;
  style?: CSSProperties;
  children: ReactNode;
}

export function DataTable({ minWidth = 760, style, children }: DataTableProps) {
  return (
    <Table.ScrollContainer className="data-table-card" minWidth={minWidth} style={style}>
      <Table className="ds-table">{children}</Table>
    </Table.ScrollContainer>
  );
}
