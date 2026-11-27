import {CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis} from "recharts";

type Sample = {timestamp: string; time: number; value: number};

type Props = {
  samples: Sample[];
  label: string;
  unit: string;
  color: string;
  range: {min: number; max: number};
  formatNumber: (value: number) => string;
  formatTimestamp: (timestamp: number) => string;
};

export default function TelemetryDetailChart({samples,label,unit,color,range,formatNumber,formatTimestamp}: Props) {
  const values = samples.map((sample) => sample.value);
  const low = Math.min(range.min,...values);
  const high = Math.max(range.max,...values);
  const padding = Math.max((high-low)*0.08,0.1);
  const unitText = unit ? ` ${unit}` : "";

  return <div className="telemetry-recharts-frame" role="img" aria-label={`${label} trend with ${samples.length} raw readings`}>
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={samples} margin={{top:14,right:12,bottom:4,left:0}}>
        <CartesianGrid stroke="#e5ece7" strokeDasharray="3 4" vertical={false} />
        <ReferenceArea y1={range.min} y2={range.max} fill={color} fillOpacity={0.08} strokeOpacity={0} />
        <ReferenceLine y={range.min} stroke={color} strokeOpacity={0.35} strokeDasharray="4 4" />
        <ReferenceLine y={range.max} stroke={color} strokeOpacity={0.35} strokeDasharray="4 4" />
        <XAxis dataKey="time" type="number" scale="time" domain={["dataMin","dataMax"]} tickFormatter={formatTimestamp} minTickGap={28} tick={{fill:"#718078",fontSize:10}} tickLine={false} axisLine={{stroke:"#dce5df"}} />
        <YAxis domain={[low-padding,high+padding]} width={48} tickFormatter={(tick:number) => formatNumber(tick)} tick={{fill:"#718078",fontSize:10}} tickLine={false} axisLine={false} />
        <Tooltip labelFormatter={(tick) => new Date(Number(tick)).toLocaleString()} formatter={(reading) => [`${formatNumber(Number(reading))}${unitText}`,label]} contentStyle={{border:"1px solid #dce5df",borderRadius:12,boxShadow:"0 8px 24px rgba(13,51,36,.12)",fontSize:12}} labelStyle={{marginBottom:4,color:"#52665a",fontWeight:700}} />
        <Line type="linear" dataKey="value" name={label} stroke={color} strokeWidth={2.5} dot={samples.length <= 32 ? {r:3,fill:color,strokeWidth:1} : false} activeDot={{r:5,strokeWidth:2}} isAnimationActive={samples.length < 300} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  </div>;
}
