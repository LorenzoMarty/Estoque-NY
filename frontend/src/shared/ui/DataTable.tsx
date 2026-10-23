import { Table } from "@mantine/core";
import type { CSSProperties, ReactNode } from "react";

interface DataTableProps {
  minWidth?: number;
  label?: string;
  style?: CSSProperties;
  /** Render without the card border/radius and the shared table skin, for tables that sit inside another card. */
  bare?: boolean;
  tableClassName?: string;
  children: ReactNode;
}

export function DataTable({ minWidth = 760, label = "Tabela de dados", style, bare = false, tableClassName, children }: DataTableProps) {
  return (
    <Table.ScrollContainer
      className={bare ? undefined : "data-table-card"}
      minWidth={minWidth}
      scrollAreaProps={{ viewportProps: { tabIndex: 0, role: "region", "aria-label": label } }}
      style={style}
    >
      <Table className={tableClassName ?? (bare ? undefined : "ds-table")}>{children}</Table>
    </Table.ScrollContainer>
  );
}
