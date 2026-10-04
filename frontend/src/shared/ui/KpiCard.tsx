import { Text } from "@mantine/core";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ComponentType } from "react";
import type { StatusTone } from "../../app/theme";
import CountUp from "../reactbits/CountUp";
import SpotlightCard from "../reactbits/SpotlightCard";

export interface KpiTrend {
  direction: "up" | "down" | "flat";
  value: number;
}

interface KpiCardProps {
  label: string;
  value: number;
  icon: ComponentType<{ size?: number }>;
  trend: KpiTrend;
  caption?: string;
}

function trendTone(direction: KpiTrend["direction"]): StatusTone {
  if (direction === "up") return "good";
  if (direction === "down") return "critical";
  return "neutral";
}

export function KpiCard({ label, value, icon: Icon, trend, caption = "vs período anterior" }: KpiCardProps) {
  const tone = trendTone(trend.direction);
  const TrendIcon = trend.direction === "up" ? ArrowUpRight : trend.direction === "down" ? ArrowDownRight : Minus;

  return (
    <SpotlightCard as="article" className="kpi-tile" aria-label={label}>
      <span className="kpi-tile-icon">
        <Icon size={18} />
      </span>
      <Text className="kpi-tile-label">{label}</Text>
      <Text className="kpi-tile-value">
        <CountUp to={value} />
      </Text>
      <span className="kpi-tile-trend" data-tone={tone}>
        <TrendIcon size={14} aria-hidden />
        {trend.direction === "flat" ? "Estável" : `${trend.value.toFixed(0)}%`}
        <small>{caption}</small>
      </span>
    </SpotlightCard>
  );
}
