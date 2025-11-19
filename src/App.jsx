import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RefreshCw, Code, ZoomIn, ZoomOut, Eye, EyeOff, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, Zap, Skull, Fuel, AlertTriangle, CheckCircle } from 'lucide-react';

// --- CONFIGURACIÓN Y UTILIDADES ---

const GRID_SIZE = 15;
const TILE_SIZE = 40; // px
const DIRECTIONS = [
  { dr: -1, dc: 0, label: 'N' }, // 0: North
  { dr: 0, dc: 1, label: 'E' },  // 1: East
  { dr: 1, dc: 0, label: 'S' },  // 2: South
  { dr: 0, dc: -1, label: 'W' }  // 3: West
];

// Tipos de celda
const CELL = {
  EMPTY: 0,
  WALL: 1,
  HOLE: 2,
  GAS: 3,
  START: 4,
  GOAL: 5
};

// Código por defecto (Solución básica precargada)
const DEFAULT_CODE = `
// Available commands:
// moveFront(), turnLeft(), turnRight(), shoot()
//
// Sensors (relative to car):
// sensor.front, sensor.left, sensor.right, sensor.back
// sensor.frontLeft, sensor.frontRight, etc.
//
// What handles contain: 'empty', 'wall', 'hole', 'gas', 'monster', 'goal', 'visited'
//
// Status:
// smellGas (boolean), feelBreeze (boolean)

// --- LOGIC START ---

// Write your code logic here...

`;

// --- MAPA PRECARGADO ---
const INITIAL_MAP = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 4, 0, 0, 0, 1, 3, 0, 0, 0, 0, 0, 0, 3, 1],
  [1, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1],
  [1, 3, 0, 0, 2, 0, 0, 2, 0, 0, 0, 2, 1, 0, 1],
  [1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 2, 1, 0, 1, 1, 1, 0, 1, 2, 1, 0, 1],
  [1, 0, 1, 3, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
  [1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1],
  [1, 0, 0, 2, 0, 0, 0, 0, 0, 2, 0, 0, 1, 0, 1],
  [1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1],
  [1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 1, 2, 1, 0, 1, 2, 1, 1, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 1, 3, 1, 0, 0, 0, 0, 5, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

export default function AgentGame() {
  // Estado del Juego
  const [grid, setGrid] = useState(INITIAL_MAP);
  const [visited, setVisited] = useState([]); // Array de strings "r,c"
  const [agent, setAgent] = useState({ r: 1, c: 1, dir: 1, fuel: 100, alive: true, win: false });
  const [monster, setMonster] = useState({ r: 8, c: 8, stun: 0 });
  
  // Estado de la UI
  const [isRunning, setIsRunning] = useState(false);
  const [userCode, setUserCode] = useState(DEFAULT_CODE);
  const [showCode, setShowCode] = useState(false); // Ventana cerrada por defecto
  const [scale, setScale] = useState(1);
  const [logs, setLogs] = useState(["Sistema iniciado. Esperando programa..."]);
  const [gameTick, setGameTick] = useState(0);
  const [fogEnabled, setFogEnabled] = useState(false);
  const [gameOverReason, setGameOverReason] = useState(null);

  // Referencias para el bucle del juego
  const intervalRef = useRef(null);
  
  // --- LÓGICA DEL MOTOR ---

  const addLog = (msg) => {
    setLogs(prev => [msg, ...prev].slice(0, 20));
  };

  const resetGame = () => {
    setIsRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setAgent({ r: 1, c: 1, dir: 1, fuel: 100, alive: true, win: false });
    setMonster({ r: 8, c: 8, stun: 0 });
    setVisited(["1,1"]);
    setGrid(JSON.parse(JSON.stringify(INITIAL_MAP))); // Deep copy reset
    setGameTick(0);
    setGameOverReason(null);
    setFogEnabled(false);
    addLog("Simulación reiniciada.");
  };

  const getCellContent = (r, c) => {
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return 'wall';
    const val = grid[r][c];
    if (r === monster.r && c === monster.c) return 'monster';
    if (val === CELL.WALL) return 'wall';
    if (val === CELL.HOLE) return 'hole';
    if (val === CELL.GAS) return 'gas';
    if (val === CELL.GOAL) return 'goal';
    if (visited.includes(`${r},${c}`)) return 'visited';
    return 'empty';
  };

  // Obtener coordenadas relativas basadas en la dirección del agente
  const getRelativeCoord = (r, c, dir, frontStep, rightStep) => {
    // dir: 0=N, 1=E, 2=S, 3=W
    // frontStep: +1 adelante, -1 atrás
    // rightStep: +1 derecha, -1 izquierda
    let dr = 0, dc = 0;
    
    if (dir === 0) { dr = -frontStep; dc = rightStep; }       // N
    else if (dir === 1) { dr = rightStep; dc = frontStep; }   // E
    else if (dir === 2) { dr = frontStep; dc = -rightStep; }  // S
    else if (dir === 3) { dr = -rightStep; dc = -frontStep; } // W
    
    return { r: r + dr, c: c + dc };
  };

  // --- EJECUCIÓN DE UN TURNO ---

  const runTurn = useCallback(() => {
    if (!agent.alive || agent.win || agent.fuel <= 0) {
      setIsRunning(false);
      return;
    }

    let newAgent = { ...agent };
    let newGrid = [...grid];
    let newMonster = { ...monster };
    let actionTaken = "wait";
    
    // 1. Percepciones (Sensores) para el usuario
    // Definimos las 8 celdas relativas
    const directionsMap = {
        front: [1, 0], back: [-1, 0], left: [0, -1], right: [0, 1],
        frontLeft: [1, -1], frontRight: [1, 1], backLeft: [-1, -1], backRight: [-1, 1]
    };

    const sensors = {};
    Object.keys(directionsMap).forEach(key => {
        const [f, s] = directionsMap[key];
        const pos = getRelativeCoord(newAgent.r, newAgent.c, newAgent.dir, f, s);
        sensors[key] = getCellContent(pos.r, pos.c);
    });

    // Sensores de ambiente
    const feelBreeze = Object.values(directionsMap).some(([f,s]) => {
        const pos = getRelativeCoord(newAgent.r, newAgent.c, newAgent.dir, f, s);
        return grid[pos.r]?.[pos.c] === CELL.HOLE;
    });

    const smellGas = Object.values(directionsMap).some(([f,s]) => {
        const pos = getRelativeCoord(newAgent.r, newAgent.c, newAgent.dir, f, s);
        return grid[pos.r]?.[pos.c] === CELL.GAS;
    });


    // 2. Sandbox para el código del usuario
    // Funciones disponibles para el usuario
    let userAction = null;
    const moveFront = () => userAction = 'move';
    const turnLeft = () => userAction = 'left';
    const turnRight = () => userAction = 'right';
    const shoot = () => userAction = 'shoot';

    try {
      // Creamos una función segura
      const userFunction = new Function(
        'sensor', 'smellGas', 'feelBreeze', 'moveFront', 'turnLeft', 'turnRight', 'shoot', 
        userCode
      );
      userFunction(sensors, smellGas, feelBreeze, moveFront, turnLeft, turnRight, shoot);
    } catch (e) {
      addLog(`Error en código: ${e.message}`);
      setIsRunning(false);
      return;
    }

    // 3. Ejecutar acción del Agente
    if (userAction === 'move') {
      const nextPos = getRelativeCoord(newAgent.r, newAgent.c, newAgent.dir, 1, 0);
      const cellType = grid[nextPos.r]?.[nextPos.c];

      if (cellType === CELL.WALL) {
        addLog("¡Choque contra muro!");
        newAgent.fuel -= 5;
      } else {
        newAgent.r = nextPos.r;
        newAgent.c = nextPos.c;
        newAgent.fuel -= 1; // Gasto normal

        // Chequear eventos de celda
        if (cellType === CELL.HOLE) {
          newAgent.alive = false;
          setGameOverReason("Caíste en un agujero.");
        } else if (cellType === CELL.GAS) {
          newAgent.fuel = Math.min(100, newAgent.fuel + 30);
          newGrid[newAgent.r][newAgent.c] = CELL.EMPTY; // Consumir gas
          addLog("Gasolina recolectada (+30)");
        } else if (cellType === CELL.GOAL) {
          newAgent.win = true;
          setGameOverReason("¡Misión Cumplida!");
        }
      }
    } else if (userAction === 'left') {
      newAgent.dir = (newAgent.dir + 3) % 4;
      newAgent.fuel -= 1;
    } else if (userAction === 'right') {
      newAgent.dir = (newAgent.dir + 1) % 4;
      newAgent.fuel -= 1;
    } else if (userAction === 'shoot') {
      newAgent.fuel -= 5;
      addLog("Disparo efectuado.");
      // Lógica de disparo (3 celdas al frente)
      for(let i=1; i<=3; i++) {
        const target = getRelativeCoord(newAgent.r, newAgent.c, newAgent.dir, i, 0);
        // Golpear monstruo
        if (target.r === monster.r && target.c === monster.c) {
             newMonster.stun = 5; // Atontado 5 turnos
             addLog("¡Monstruo aturdido!");
             break;
        }
        // Romper bloque (opcional, si es un bloque rompible, aquí asumimos muros fijos pero podemos añadir bloques rompibles)
      }
    } else {
      newAgent.fuel -= 1; // Idle cost
    }

    // Actualizar visitados
    setVisited(prev => {
        if (!prev.includes(`${newAgent.r},${newAgent.c}`)) {
            return [...prev, `${newAgent.r},${newAgent.c}`];
        }
        return prev;
    });

    // 4. Lógica del Monstruo (Se mueve cada 2 turnos)
    if (newAgent.alive && !newAgent.win && (gameTick + 1) % 2 === 0 && newMonster.stun === 0) {
      // IA simple: perseguir
      // Calcular distancias
      const dr = newAgent.r - newMonster.r;
      const dc = newAgent.c - newMonster.c;
      let moveR = 0; 
      let moveC = 0;

      if (Math.abs(dr) > Math.abs(dc)) {
        moveR = Math.sign(dr);
      } else {
        moveC = Math.sign(dc);
      }

      // Chequear colisiones básicas para el monstruo
      const nextMr = newMonster.r + moveR;
      const nextMc = newMonster.c + moveC;
      
      if (grid[nextMr][nextMc] !== CELL.WALL && grid[nextMr][nextMc] !== CELL.HOLE) {
        newMonster.r = nextMr;
        newMonster.c = nextMc;
      }
    } else if (newMonster.stun > 0) {
        newMonster.stun--;
    }

    // Colisión final Agente-Monstruo
    if (newAgent.r === newMonster.r && newAgent.c === newMonster.c) {
        newAgent.alive = false;
        setGameOverReason("El monstruo te ha comido.");
    }

    if (newAgent.fuel <= 0) {
        newAgent.alive = false;
        setGameOverReason("Sin combustible.");
    }

    // Actualizar Estados
    setGrid(newGrid);
    setAgent(newAgent);
    setMonster(newMonster);
    setGameTick(t => t + 1);

  }, [agent, grid, monster, userCode, gameTick]);

  // --- CONTROL DEL BUCLE ---

  useEffect(() => {
    if (isRunning) {
        // Activar niebla de guerra al iniciar
        setFogEnabled(true);
        intervalRef.current = setInterval(runTurn, 500); // Velocidad del juego
    } else {
        clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning, runTurn]);


  // --- RENDERIZADO ---

  const getCellColor = (r, c, type) => {
    // Fog of War logic
    const isVisited = visited.includes(`${r},${c}`);
    const isVisible = !fogEnabled || isVisited || (Math.abs(agent.r - r) <= 1 && Math.abs(agent.c - c) <= 1);

    if (!isVisible) return "bg-gray-900 border-gray-800"; // Oscuridad

    if (type === CELL.WALL) return "bg-slate-700 border-slate-600 shadow-inner";
    if (type === CELL.HOLE) return "bg-black border-red-900"; // Agujero
    if (type === CELL.GOAL) return "bg-green-500/20 border-green-500";
    
    return (r + c) % 2 === 0 ? "bg-slate-50 border-slate-200" : "bg-white border-slate-200";
  };

  const renderEntity = (r, c) => {
    const isVisible = !fogEnabled || visited.includes(`${r},${c}`) || (Math.abs(agent.r - r) <= 1 && Math.abs(agent.c - c) <= 1);
    if (!isVisible) return null;

    if (r === agent.r && c === agent.c) {
        return (
            <div 
                className="absolute inset-0 flex items-center justify-center transition-transform duration-300 z-20"
                style={{ transform: `rotate(${agent.dir * 90}deg)` }}
            >
                <div className="w-8 h-8 bg-blue-600 rounded-sm relative shadow-lg border-2 border-blue-400">
                    {/* Headlights */}
                    <div className="absolute -top-1 left-1 w-1 h-2 bg-yellow-300 shadow-[0_0_10px_rgba(253,224,71,0.8)]"></div>
                    <div className="absolute -top-1 right-1 w-1 h-2 bg-yellow-300 shadow-[0_0_10px_rgba(253,224,71,0.8)]"></div>
                    {/* Windshield */}
                    <div className="absolute top-2 left-1 right-1 h-2 bg-blue-300/50 rounded-sm"></div>
                </div>
            </div>
        );
    }
    if (r === monster.r && c === monster.c) {
        return (
            <div className="absolute inset-0 flex items-center justify-center z-10 animate-bounce">
                <Skull className={`w-8 h-8 ${monster.stun > 0 ? 'text-gray-400' : 'text-red-600'}`} />
                {monster.stun > 0 && <div className="absolute -top-2 text-xs font-bold text-yellow-500">ZZz</div>}
            </div>
        );
    }
    const type = grid[r][c];
    if (type === CELL.GAS) return <div className="absolute inset-0 flex items-center justify-center"><Fuel className="text-orange-500 w-6 h-6 drop-shadow-md" /></div>;
    if (type === CELL.HOLE) return <div className="absolute inset-0 flex items-center justify-center text-xs text-red-800 font-bold">HOLE</div>;
    if (type === CELL.GOAL) return <div className="absolute inset-0 flex items-center justify-center"><div className="w-6 h-6 bg-green-500 rounded-full animate-pulse" /></div>;
    return null;
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-100 font-sans overflow-hidden">
      
      {/* HEADER */}
      <header className="h-16 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-4 z-30 shadow-md">
        <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg"><Code size={20} /></div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-300">
                Coche Autómata <span className="text-slate-400 font-normal text-sm">| Misión Rescate</span>
            </h1>
        </div>

        <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-sm bg-slate-900 px-3 py-1 rounded-full border border-slate-700">
                <Fuel size={16} className={agent.fuel < 20 ? "text-red-500 animate-pulse" : "text-orange-400"} />
                <span className="font-mono w-8">{agent.fuel}</span>
            </div>
            
            <div className="flex items-center gap-2">
                <button onClick={() => setScale(s => Math.max(0.5, s - 0.1))} className="p-2 hover:bg-slate-700 rounded"><ZoomOut size={18} /></button>
                <span className="text-xs text-slate-500">{Math.round(scale * 100)}%</span>
                <button onClick={() => setScale(s => Math.min(2, s + 0.1))} className="p-2 hover:bg-slate-700 rounded"><ZoomIn size={18} /></button>
            </div>

            <div className="h-6 w-px bg-slate-600 mx-2"></div>

            <button 
                onClick={resetGame} 
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-md transition-colors text-sm font-medium"
            >
                <RefreshCw size={16} /> Reset
            </button>
            
            <button 
                onClick={() => setIsRunning(!isRunning)}
                disabled={!agent.alive || agent.win}
                className={`flex items-center gap-2 px-6 py-2 rounded-md font-bold transition-all shadow-lg ${
                    isRunning ? 'bg-amber-600 hover:bg-amber-500' : 'bg-green-600 hover:bg-green-500'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
                {isRunning ? <><Pause size={18} /> PAUSA</> : <><Play size={18} /> RUN</>}
            </button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <div className="flex-1 relative flex overflow-hidden">
        
        {/* VIEWPORT DEL JUEGO */}
        <div className="flex-1 bg-black relative overflow-auto flex items-center justify-center p-10 cursor-move active:cursor-grabbing">
            <div 
                className="relative transition-transform duration-300 ease-out shadow-2xl"
                style={{ 
                    transform: `scale(${scale})`,
                    width: GRID_SIZE * TILE_SIZE,
                    height: GRID_SIZE * TILE_SIZE
                }}
            >
                <div 
                    className="grid gap-[1px] bg-slate-800 border-4 border-slate-700"
                    style={{ 
                        gridTemplateColumns: `repeat(${GRID_SIZE}, ${TILE_SIZE}px)`,
                        gridTemplateRows: `repeat(${GRID_SIZE}, ${TILE_SIZE}px)`
                    }}
                >
                    {grid.map((row, r) => row.map((type, c) => (
                        <div 
                            key={`${r}-${c}`} 
                            className={`relative w-full h-full border box-border transition-colors duration-500 ${getCellColor(r, c, type)}`}
                        >
                            {/* Grid helper lines */}
                            <div className="absolute inset-0 opacity-5 pointer-events-none border border-white/10"></div>
                            {renderEntity(r, c)}
                        </div>
                    )))}
                </div>
            </div>

            {/* OVERLAYS DE ESTADO */}
            {!agent.alive && (
                <div className="absolute inset-0 bg-black/80 flex items-center justify-center backdrop-blur-sm z-50">
                    <div className="bg-slate-800 p-8 rounded-2xl border border-red-500/50 text-center max-w-md shadow-2xl">
                        <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                        <h2 className="text-3xl font-bold text-white mb-2">GAME OVER</h2>
                        <p className="text-red-300 mb-6">{gameOverReason || "El agente ha sido destruido."}</p>
                        <button onClick={resetGame} className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-full font-bold transition-transform hover:scale-105">
                            Reintentar Nivel
                        </button>
                    </div>
                </div>
            )}
            
            {agent.win && (
                <div className="absolute inset-0 bg-black/80 flex items-center justify-center backdrop-blur-sm z-50">
                    <div className="bg-slate-800 p-8 rounded-2xl border border-green-500/50 text-center max-w-md shadow-2xl">
                        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                        <h2 className="text-3xl font-bold text-white mb-2">¡ÉXITO!</h2>
                        <p className="text-green-300 mb-6">Misión completada. Combustible restante: {agent.fuel}</p>
                        <button onClick={resetGame} className="px-6 py-3 bg-green-600 hover:bg-green-500 text-white rounded-full font-bold transition-transform hover:scale-105">
                            Jugar de Nuevo
                        </button>
                    </div>
                </div>
            )}
        </div>

        {/* CODING PANEL (TOGGLEABLE) */}
        <div className={`absolute top-4 left-4 bottom-4 w-[675px] bg-slate-900/95 backdrop-blur border border-slate-700 shadow-2xl flex flex-col transition-transform duration-300 rounded-xl overflow-hidden z-40 ${showCode ? 'translate-x-0' : '-translate-x-[685px]'}`}>
            <div className="bg-slate-800 p-3 flex justify-between items-center border-b border-slate-700">
                <span className="font-mono text-sm text-blue-400 font-bold flex items-center gap-2">
                    <Code size={16}/> agent_script.js
                </span>
                <button onClick={() => setShowCode(false)} className="text-slate-400 hover:text-white"><ChevronLeft/></button>
            </div>
            
            <div className="flex-1 relative">
                <textarea 
                    className="w-full h-full bg-[#0d1117] text-slate-300 font-mono text-sm p-4 focus:outline-none resize-none leading-relaxed"
                    value={userCode}
                    onChange={(e) => setUserCode(e.target.value)}
                    spellCheck="false"
                />
            </div>
            
            <div className="h-48 bg-slate-950 border-t border-slate-800 flex flex-col">
                <div className="px-3 py-1 bg-slate-900 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-800">Console Logs</div>
                <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-1">
                    {logs.map((log, i) => (
                        <div key={i} className="text-slate-400 border-l-2 border-slate-700 pl-2">
                            <span className="text-slate-600 mr-2">[{logs.length - i}]</span>{log}
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* TOGGLE BUTTON FOR CODE */}
        <button 
            onClick={() => setShowCode(!showCode)}
            className={`absolute top-8 left-0 bg-blue-600 text-white p-3 rounded-r-lg shadow-lg hover:bg-blue-500 transition-all z-40 ${showCode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        >
            <ChevronRight size={24} />
        </button>

        {/* SENSOR DEBUG OVERLAY (Bottom Right) */}
        <div className="absolute bottom-6 right-6 bg-slate-900/80 backdrop-blur p-4 rounded-xl border border-slate-700 shadow-xl text-xs">
            <h3 className="text-slate-400 font-bold mb-2 uppercase tracking-wider flex items-center gap-2"><Zap size={12}/> Sensores</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-300">
               <div className={`flex items-center gap-2 ${getCellContent(agent.r, agent.c) === 'hole' ? 'text-red-400' : ''}`}>
                   <div className={`w-2 h-2 rounded-full ${grid[agent.r]?.[agent.c] === CELL.HOLE ? 'bg-red-500' : 'bg-slate-600'}`}></div>
                   Breeze: <span className={logs[0]?.includes('hole') ? 'text-white font-bold' : 'text-slate-500'}>Active</span>
               </div>
               <div className="flex items-center gap-2">
                   <div className={`w-2 h-2 rounded-full ${grid[agent.r]?.[agent.c] === CELL.GAS ? 'bg-orange-500' : 'bg-slate-600'}`}></div>
                   Smell: <span className={logs[0]?.includes('gas') ? 'text-white font-bold' : 'text-slate-500'}>Active</span>
               </div>
            </div>
        </div>

      </div>
    </div>
  );
}
