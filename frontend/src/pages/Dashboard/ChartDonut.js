import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { TrendingUp, Users, Heart, AlertTriangle, BarChart3 } from 'lucide-react';

const ChartDonut = (props) => {
  const { title, value, data, color, counters } = props;
  
  // Se counters estiver disponível, calcular dados reais da API
  let chartData = [];
  let displayValue = value;
  
  if (counters && title === "Score") {
    // Para o gráfico principal de NPS Score
    const totalRatings = (counters.npsPromotersPerc || 0) + (counters.npsDetractorsPerc || 0) + (counters.npsPassivePerc || 0);
    
    if (totalRatings > 0) {
      chartData = [
        { name: "Promotores", value: counters.npsPromotersPerc || 0 },
        { name: "Detratores", value: counters.npsDetractorsPerc || 0 },
        { name: "Neutros", value: counters.npsPassivePerc || 0 }
      ];
    } else {
      chartData = [{ name: "Sem dados", value: 100 }];
    }
    displayValue = counters.npsScore || 0;
  } else if (counters) {
    // Para gráficos individuais (Promotores, Neutros, Detratores)
    let apiValue = 0;
    if (title.toLowerCase().includes('promotores') || title.toLowerCase().includes('prosecutors')) {
      apiValue = counters.npsPromotersPerc || 0;
    } else if (title.toLowerCase().includes('neutros') || title.toLowerCase().includes('neutral')) {
      apiValue = counters.npsPassivePerc || 0;
    } else if (title.toLowerCase().includes('detratores') || title.toLowerCase().includes('detractors')) {
      apiValue = counters.npsDetractorsPerc || 0;
    }
    
    chartData = [{ name: title, value: 100 }];
    displayValue = apiValue;
  } else {
    // Fallback para o formato antigo (apenas para compatibilidade)
    try {
      chartData = JSON.parse(`[${String(data).replace(/'/g, '"')}]`);
    } catch (error) {
      console.error('Erro ao parsear dados:', error);
      chartData = [{ name: "Erro", value: 100 }];
    }
  }
  
  // Determinar cores com gradientes modernos
  let chartColors = [];
  if (title === "Score") {
    const totalRatings = (counters?.npsPromotersPerc || 0) + (counters?.npsDetractorsPerc || 0) + (counters?.npsPassivePerc || 0);
    chartColors = totalRatings === 0 ? ["#94a3b8"] : ["#10b981", "#ef4444", "#f59e0b"];
  } else if (color && Array.isArray(color)) {
    chartColors = color;
  } else if (color) {
    chartColors = [color];
  } else {
    chartColors = ["#6366f1"]; // cor padrão moderna
  }
  
  // Função para determinar o ícone baseado no título
  const getIcon = () => {
    const iconProps = { size: 28, className: "text-gray-600" };
    
    if (title === "Score") return <BarChart3 {...iconProps} />;
    if (title.toLowerCase().includes('promotores')) return <Heart {...iconProps} className="text-green-600" />;
    if (title.toLowerCase().includes('neutros')) return <Users {...iconProps} className="text-yellow-600" />;
    if (title.toLowerCase().includes('detratores')) return <AlertTriangle {...iconProps} className="text-red-600" />;
    return <TrendingUp {...iconProps} />;
  };
  
  // Função para determinar a cor do valor baseado no score/tipo
  const getValueColor = () => {
    if (title === "Score") {
      const score = displayValue;
      if (score >= 70) return "text-green-600";
      if (score >= 30) return "text-yellow-600";
      return "text-red-600";
    }
    if (title.toLowerCase().includes('promotores')) return "text-green-600";
    if (title.toLowerCase().includes('neutros')) return "text-yellow-600";
    if (title.toLowerCase().includes('detratores')) return "text-red-600";
    return "text-gray-700";
  };
  
  const renderCustomLabel = ({ cx, cy }) => {
    return (
      <g>
        {/* Ícone */}
        <foreignObject x={cx - 14} y={cy - 35} width={28} height={28}>
          {getIcon()}
        </foreignObject>
        
        {/* Valor principal */}
        <text 
          x={cx} 
          y={cy + 8} 
          textAnchor="middle" 
          dominantBaseline="middle"
          className={`text-3xl font-bold ${getValueColor()}`}
          style={{ fontSize: '28px', fontWeight: '700' }}
        >
          {`${displayValue}${title === "Score" ? '' : '%'}`}
        </text>
        
        {/* Título */}
        <text 
          x={cx} 
          y={cy + 28} 
          textAnchor="middle" 
          dominantBaseline="middle"
          className="text-sm font-medium text-gray-500"
          style={{ fontSize: '12px', fontWeight: '500' }}
        >
          {title}
        </text>
      </g>
    );
  };
  
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {getIcon()}
          <div>
            <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
            <p className="text-sm text-gray-500">Análise NPS</p>
          </div>
        </div>
        
        {/* Badge de status */}
        <div className={`px-3 py-1 rounded-full text-xs font-medium ${
          title === "Score" 
            ? displayValue >= 70 
              ? "bg-green-100 text-green-800" 
              : displayValue >= 30 
                ? "bg-yellow-100 text-yellow-800" 
                : "bg-red-100 text-red-800"
            : title.toLowerCase().includes('promotores')
              ? "bg-green-100 text-green-800"
              : title.toLowerCase().includes('neutros')
                ? "bg-yellow-100 text-yellow-800"
                : "bg-red-100 text-red-800"
        }`}>
          {title === "Score" 
            ? displayValue >= 70 ? "Excelente" : displayValue >= 30 ? "Bom" : "Precisa Melhorar"
            : `${displayValue}%`
          }
        </div>
      </div>
      
      <div className="relative">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={renderCustomLabel}
              outerRadius={85}
              innerRadius={55}
              fill="#8884d8"
              dataKey="value"
              strokeWidth={0}
            >
              {chartData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={chartColors[index % chartColors.length]}
                  className="hover:opacity-80 transition-opacity duration-200"
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        
        {/* Gradiente de fundo sutil */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50/30 to-purple-50/30 rounded-xl -z-10"></div>
      </div>
      
      {/* Legenda personalizada para gráfico de Score */}
      {title === "Score" && chartData.length > 1 && (
        <div className="mt-4 flex justify-center gap-4">
          {chartData.map((entry, index) => (
            <div key={entry.name} className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: chartColors[index] }}
              ></div>
              <span className="text-xs text-gray-600 font-medium">
                {entry.name} ({entry.value}%)
              </span>
            </div>
          ))}
        </div>
      )}
      
      {/* Linha decorativa inferior */}
      <div className="mt-4 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-full opacity-20"></div>
    </div>
  );
};

export default ChartDonut;