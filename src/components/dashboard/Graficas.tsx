import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Promedio } from "@/lib/dashboard-calc";
import { fechaCorta } from "@/lib/dashboard-calc";

export type Colorear = (sujeto: string, partido: string, sent: boolean) => string;

const TINTA = "#1a2030";
const TINTA_TENUE = "#667085";
const REJILLA = "#eef0f4";
const pct = (v: number) => `${v.toFixed(1)}%`;

function Leyenda({ items }: { items: { nombre: string; color: string }[] }) {
  if (items.length < 2) return null;
  return (
    <div className="db-leyenda">
      {items.map((i) => (
        <span key={i.nombre}>
          <i className="db-punto" style={{ background: i.color }} />
          {i.nombre}
        </span>
      ))}
    </div>
  );
}

// ---------- Promedio por candidato / partido ----------

export function BarrasPromedio({ datos, colorear }: { datos: Promedio[]; colorear: Colorear }) {
  if (!datos.length) return <p className="db-vacio">No hay mediciones con estos filtros.</p>;
  const filas = datos.slice(0, 14);
  const alto = filas.length * 34 + 24;
  return (
    <ResponsiveContainer width="100%" height={alto}>
      <BarChart data={filas} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }} barCategoryGap={8}>
        <XAxis type="number" hide domain={[0, (max: number) => Math.max(10, Math.ceil(max * 1.05))]} />
        <YAxis
          type="category"
          dataKey="sujeto"
          width={170}
          tickLine={false}
          axisLine={false}
          tick={{ fill: TINTA, fontSize: 12 }}
          tickFormatter={(s: string) => (s.length > 26 ? s.slice(0, 25) + "…" : s)}
        />
        <Tooltip
          cursor={{ fill: "rgba(47,111,237,0.06)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as Promedio;
            return (
              <div className="db-tooltip">
                <div className="db-tooltip-titulo">{p.sujeto}</div>
                {p.partido && p.partido !== p.sujeto && <div className="db-tenue">{p.partido}</div>}
                <div>
                  Promedio <strong>{pct(p.promedio)}</strong>
                </div>
                <div className="db-tenue">
                  {p.n} {p.n === 1 ? "medición" : "mediciones"} de {p.casas} {p.casas === 1 ? "casa" : "casas"}
                </div>
              </div>
            );
          }}
        />
        <Bar dataKey="promedio" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
          {filas.map((p) => (
            <Cell key={p.sujeto} fill={colorear(p.sujeto, p.partido, p.sent)} />
          ))}
          <LabelList dataKey="promedio" position="right" formatter={(v) => pct(Number(v))} fill={TINTA} fontSize={12} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------- Tendencia en el tiempo ----------

type FilaTendencia = Record<string, number | string>;

export function LineaTendencia({
  datos,
  series,
  partidoDe,
  colorear,
}: {
  datos: FilaTendencia[];
  series: string[];
  partidoDe: (s: string) => string;
  colorear: Colorear;
}) {
  if (!datos.length || !series.length) return <p className="db-vacio">No hay mediciones con estos filtros.</p>;
  if (datos.length < 2)
    return <p className="db-vacio">Solo hay una fecha con datos; la tendencia aparece cuando haya al menos dos mediciones.</p>;

  // Etiqueta directa al final de cada línea cuando son pocas series.
  const ultimo: Record<string, number> = {};
  for (const s of series) datos.forEach((f, i) => typeof f[s] === "number" && (ultimo[s] = i));
  const etiquetar = series.length <= 4;

  return (
    <>
      <Leyenda items={series.map((s) => ({ nombre: s, color: colorear(s, partidoDe(s), false) }))} />
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={datos} margin={{ top: 8, right: etiquetar ? 96 : 16, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={REJILLA} vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t: number) => fechaCorta(new Date(t).toISOString().slice(0, 10))}
            tick={{ fill: TINTA_TENUE, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: REJILLA }}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fill: TINTA_TENUE, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip
            cursor={{ stroke: TINTA_TENUE, strokeDasharray: "3 3" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const items = [...payload].sort((a, b) => Number(b.value) - Number(a.value));
              return (
                <div className="db-tooltip">
                  <div className="db-tooltip-titulo">{fechaCorta(new Date(Number(label)).toISOString().slice(0, 10))}</div>
                  {items.map((it) => (
                    <div className="db-tooltip-fila" key={String(it.dataKey)}>
                      <span>
                        <i className="db-punto" style={{ background: it.color }} />
                        {String(it.dataKey)}
                      </span>
                      <strong>{pct(Number(it.value))}</strong>
                    </div>
                  ))}
                </div>
              );
            }}
          />
          {series.map((s) => {
            const color = colorear(s, partidoDe(s), false);
            return (
              <Line
                key={s}
                type="linear"
                dataKey={s}
                stroke={color}
                strokeWidth={2}
                connectNulls
                isAnimationActive={false}
                dot={{ r: 4, fill: color, stroke: "#fff", strokeWidth: 2 }}
                activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }}
                label={
                  etiquetar
                    ? (props: { index?: number; x?: number | string; y?: number | string }) =>
                        props.index === ultimo[s] ? (
                          <text x={Number(props.x) + 8} y={Number(props.y) + 4} fontSize={11} fill={TINTA}>
                            {s.length > 14 ? s.slice(0, 13) + "…" : s}
                          </text>
                        ) : (
                          <g />
                        )
                    : false
                }
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}

// ---------- Última medición de cada casa ----------

export function BarrasPorCasa({
  datos,
  series,
  partidoDe,
  colorear,
}: {
  datos: FilaTendencia[];
  series: string[];
  partidoDe: (s: string) => string;
  colorear: Colorear;
}) {
  if (!datos.length || !series.length) return <p className="db-vacio">No hay mediciones con estos filtros.</p>;
  return (
    <>
      <Leyenda items={series.map((s) => ({ nombre: s, color: colorear(s, partidoDe(s), false) }))} />
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={datos} margin={{ top: 8, right: 8, bottom: 4, left: 0 }} barGap={2} barCategoryGap="22%">
          <CartesianGrid stroke={REJILLA} vertical={false} />
          <XAxis
            dataKey="casa"
            interval={0}
            tickLine={false}
            axisLine={{ stroke: REJILLA }}
            height={46}
            tick={(props: { x?: number | string; y?: number | string; payload?: { value: string; index: number } }) => {
              const fila = datos.find((f) => f.casa === props.payload?.value);
              return (
                <g transform={`translate(${Number(props.x)},${Number(props.y)})`}>
                  <text textAnchor="middle" dy={12} fontSize={11} fill={TINTA}>
                    {props.payload?.value}
                  </text>
                  <text textAnchor="middle" dy={26} fontSize={10} fill={TINTA_TENUE}>
                    {fila ? fechaCorta(String(fila.fecha)) : ""}
                  </text>
                </g>
              );
            }}
          />
          <YAxis
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fill: TINTA_TENUE, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip
            cursor={{ fill: "rgba(47,111,237,0.06)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const fila = payload[0].payload as FilaTendencia;
              return (
                <div className="db-tooltip">
                  <div className="db-tooltip-titulo">{label}</div>
                  <div className="db-tenue" style={{ marginBottom: 4 }}>
                    {fechaCorta(String(fila.fecha))}
                  </div>
                  {[...payload]
                    .sort((a, b) => Number(b.value) - Number(a.value))
                    .map((it) => (
                      <div className="db-tooltip-fila" key={String(it.dataKey)}>
                        <span>
                          <i className="db-punto" style={{ background: it.color }} />
                          {String(it.dataKey)}
                        </span>
                        <strong>{pct(Number(it.value))}</strong>
                      </div>
                    ))}
                </div>
              );
            }}
          />
          {series.map((s) => (
            <Bar
              key={s}
              dataKey={s}
              fill={colorear(s, partidoDe(s), false)}
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}
