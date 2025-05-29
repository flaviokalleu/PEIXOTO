import React, { useState, useEffect } from 'react';

const DonutChart = (props) => {
  const { title, value, color } = props;
  const [animatedValue, setAnimatedValue] = useState(0);
  
  const percentage = parseFloat(value) || 0;
  
  // Animação do contador
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedValue(percentage);
    }, 300);
    return () => clearTimeout(timer);
  }, [percentage]);
  
  // Cores baseadas no valor
  const getColor = () => {
    if (color) return color;
    if (percentage >= 80) return '#00ff88';
    if (percentage >= 60) return '#00d4ff';
    if (percentage >= 40) return '#ff9500';
    return '#ff3366';
  };
  
  const primaryColor = getColor();
  
  // Criar hexágonos para o fundo
  const hexagons = Array.from({ length: 12 }, (_, i) => {
    const angle = (i * 30) * Math.PI / 180;
    const x = 50 + 35 * Math.cos(angle);
    const y = 50 + 35 * Math.sin(angle);
    return { x, y, delay: i * 50 };
  });
  
  return (
    <div className="">
     
        
      
      
      
      <div className="relative z-10 flex flex-col items-center justify-center h-full">
        {/* Anel principal */}
        <div className="relative w-48 h-48 mb-4">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            {/* Anel externo decorativo */}
            <circle
              cx="50"
              cy="50"
              r="47"
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="0.5"
              strokeDasharray="2,2"
              className="animate-spin"
              style={{ animationDuration: '20s' }}
            />
            
            {/* Hexágonos de fundo */}
            {hexagons.map((hex, i) => (
              <circle
                key={i}
                cx={hex.x}
                cy={hex.y}
                r="1.5"
                fill={`${primaryColor}40`}
                className="animate-pulse"
                style={{ 
                  animationDelay: `${hex.delay}ms`,
                  animationDuration: '2s'
                }}
              />
            ))}
            
            {/* Trilha de fundo */}
            <circle
              cx="50"
              cy="50"
              r="38"
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="3"
            />
            
            {/* Barra de progresso principal */}
            <circle
              cx="50"
              cy="50"
              r="38"
              fill="none"
              stroke={primaryColor}
              strokeWidth="3"
              strokeDasharray={`${2 * Math.PI * 38}`}
              strokeDashoffset={`${2 * Math.PI * 38 - (animatedValue / 100) * 2 * Math.PI * 38}`}
              strokeLinecap="round"
              className="transition-all duration-2000 ease-out"
              style={{
                filter: `drop-shadow(0 0 8px ${primaryColor})`
              }}
            />
            
            {/* Barra de progresso secundária (mais fina) */}
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke={primaryColor}
              strokeWidth="1"
              strokeDasharray={`${2 * Math.PI * 42}`}
              strokeDashoffset={`${2 * Math.PI * 42 - (animatedValue / 100) * 2 * Math.PI * 42}`}
              strokeLinecap="round"
              className="transition-all duration-2000 ease-out opacity-60"
              style={{ animationDelay: '200ms' }}
            />
          </svg>
          
          {/* Indicador de posição */}
          <div 
            className="absolute w-3 h-3 rounded-full border-2 border-white shadow-lg"
            style={{
              background: primaryColor,
              top: '50%',
              left: '50%',
              transform: `translate(-50%, -50%) rotate(${(animatedValue / 100) * 360 - 90}deg) translateY(-38px)`,
              boxShadow: `0 0 12px ${primaryColor}`
            }}
          ></div>
        </div>
        
        {/* Display central */}
        <div className="text-center space-y-2">
          <div className="text-xs font-mono text-gray-400 uppercase tracking-widest">
            {title}
          </div>
          <div 
            className="text-4xl font-bold font-mono transition-all duration-1000"
            style={{ 
              color: primaryColor,
              textShadow: `0 0 20px ${primaryColor}40`
            }}
          >
            {Math.round(animatedValue)}%
          </div>
          
          {/* Barras de status */}
          <div className="flex space-x-1 justify-center mt-3">
            {Array.from({ length: 5 }, (_, i) => (
              <div
                key={i}
                className={`w-8 h-1 transition-all duration-500`}
                style={{
                  background: i < (percentage / 20) ? primaryColor : 'rgba(255,255,255,0.2)',
                  animationDelay: `${i * 100}ms`
                }}
              ></div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Partículas flutuantes */}
     
    </div>
  );
};

export default DonutChart;