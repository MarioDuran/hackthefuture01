import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RefreshCw, Code, ZoomIn, ZoomOut, ChevronRight, ChevronLeft, Zap, Skull, Fuel, AlertTriangle, CheckCircle, Target, X, HelpCircle, Sparkles, FastForward, Volume2, VolumeX } from 'lucide-react';

const GRID_SIZE = 15;
const TILE_SIZE = 40;
const DIRECTIONS = [
  { dr: -1, dc: 0, label: 'N' },
  { dr: 0, dc: 1, label: 'E' },
  { dr: 1, dc: 0, label: 'S' },
  { dr: 0, dc: -1, label: 'W' }
];

const CELL = {
  EMPTY: 0,
  WALL: 1,
  HOLE: 2,
  GAS: 3,
  START: 4,
  GOAL: 5
};

const DEFAULT_CODE = `// Escribe tu código aquí
// Tu objetivo: Llegar a la meta (celda verde)
// Tip: Usa moveFront(); para avanzar
`;

const SoundEngine = {
    ctx: null,
    init: () => {
        if (!SoundEngine.ctx) {
            SoundEngine.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    },
    play: (type) => {
        if (!SoundEngine.ctx) return;
        if (SoundEngine.ctx.state === 'suspended') SoundEngine.ctx.resume();

        const osc = SoundEngine.ctx.createOscillator();
        const gain = SoundEngine.ctx.createGain();
        osc.connect(gain);
        gain.connect(SoundEngine.ctx.destination);

        const now = SoundEngine.ctx.currentTime;

        if (type === 'move') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(50, now + 0.05);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.05);
            osc.start(now);
            osc.stop(now + 0.05);
        } else if (type === 'bump') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(100, now);
            osc.frequency.linearRampToValueAtTime(50, now + 0.1);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === 'gas') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.3);
        } else if (type === 'shoot') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(100, now + 0.2);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        } else if (type === 'win') {
            [0, 0.1, 0.2].forEach((delay, i) => {
                const o = SoundEngine.ctx.createOscillator();
                const g = SoundEngine.ctx.createGain();
                o.connect(g);
                g.connect(SoundEngine.ctx.destination);
                o.type = 'triangle';
                o.frequency.value = [523.25, 659.25, 783.99][i];
                g.gain.setValueAtTime(0.1, now + delay);
                g.gain.linearRampToValueAtTime(0, now + delay + 0.4);
                o.start(now + delay);
                o.stop(now + delay + 0.4);
            });
        } else if (type === 'loss') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.linearRampToValueAtTime(50, now + 0.5);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.5);
            osc.start(now);
            osc.stop(now + 0.5);
        }
    }
};

const createMap = (rows) => {
    const map = Array(GRID_SIZE).fill().map(() => Array(GRID_SIZE).fill(1));
    rows.forEach((row, r) => {
        row.forEach((val, c) => {
            if (r < GRID_SIZE && c < GRID_SIZE) map[r][c] = val;
        });
    });
    return map;
};

const calculateOptimalMoves = (grid, start) => {
    if (!start) return 0;
    const queue = [{ r: start.r, c: start.c, dir: start.dir, cost: 0 }];
    const visited = new Set();
    visited.add(`${start.r},${start.c},${start.dir}`);

    while (queue.length > 0) {
        const { r, c, dir, cost } = queue.shift();
        if (grid[r][c] === CELL.GOAL) return cost;

        const moves = [
            { type: 'move', cost: 1 },
            { type: 'left', cost: 1 },
            { type: 'right', cost: 1 },
            { type: 'back', cost: 1 }
        ];

        for (let m of moves) {
            let nr = r, nc = c, nd = dir;
            if (m.type === 'move') {
                const dIdx = ((dir % 4) + 4) % 4;
                nr += DIRECTIONS[dIdx].dr;
                nc += DIRECTIONS[dIdx].dc;
            } else if (m.type === 'left') {
                nd = (dir - 1 + 4) % 4;
            } else if (m.type === 'right') {
                nd = (dir + 1) % 4;
            } else if (m.type === 'back') {
                nd = (dir + 2) % 4;
            }

            if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
                const cell = grid[nr][nc];
                if (cell !== CELL.WALL && cell !== CELL.HOLE) {
                    const stateKey = `${nr},${nc},${nd}`;
                    if (!visited.has(stateKey)) {
                        visited.add(stateKey);
                        queue.push({ r: nr, c: nc, dir: nd, cost: cost + m.cost });
                    }
                }
            }
        }
    }
    return 0;
};

const getVisionField = (r, c) => {
    const cells = [];
    for(let i = -1; i <= 1; i++) {
        for(let j = -1; j <= 1; j++) {
            cells.push(`${r + i},${c + j}`);
        }
    }
    return cells;
};

const LEVELS = [
    {
        id: 1,
        title: "Nivel 1: La Recta Final",
        desc: "Aprende a moverte. Llega a la meta verde.",
        agentStart: { r: 7, c: 2, dir: 1 },
        monsterStart: { r: -1, c: -1 },
        map: createMap([
            [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
            [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
            [1,0,1,1,1,1,1,1,1,1,1,1,1,0,1],
            [1,0,1,1,1,1,1,1,1,1,1,1,1,0,1],
            [1,0,1,1,1,1,1,1,1,1,1,1,1,0,1],
            [1,0,1,1,1,1,1,1,1,1,1,1,1,0,1],
            [1,0,1,1,1,1,1,1,1,1,1,1,1,0,1],
            [1,0,4,0,0,0,0,0,0,0,0,0,5,0,1],
            [1,0,1,1,1,1,1,1,1,1,1,1,1,0,1],
            [1,0,1,1,1,1,1,1,1,1,1,1,1,0,1],
            [1,0,1,1,1,1,1,1,1,1,1,1,1,0,1],
            [1,0,1,1,1,1,1,1,1,1,1,1,1,0,1],
            [1,0,1,1,1,1,1,1,1,1,1,1,1,0,1],
            [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
            [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
        ])
    },
    {
        id: 2,
        title: "Nivel 2: El Zig Zag",
        desc: "Un solo camino con curvas. Detecta paredes y gira.",
        agentStart: { r: 2, c: 2, dir: 1 },
        monsterStart: { r: -1, c: -1 },
        map: createMap([
            [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
            [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
            [1,1,4,0,0,0,0,0,0,0,0,0,1,1,1], 
            [1,1,1,1,1,1,1,1,1,1,1,0,1,1,1], 
            [1,1,0,0,0,0,0,0,0,0,0,0,1,1,1], 
            [1,1,0,1,1,1,1,1,1,1,1,1,1,1,1], 
            [1,1,0,0,0,0,0,0,0,0,0,0,1,1,1], 
            [1,1,1,1,1,1,1,1,1,1,1,0,1,1,1], 
            [1,1,0,0,0,0,0,0,0,0,0,0,1,1,1], 
            [1,1,0,1,1,1,1,1,1,1,1,1,1,1,1], 
            [1,1,0,0,0,0,0,0,0,0,0,0,5,1,1], 
            [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
            [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
            [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
            [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
        ])
    },
    {
        id: 3,
        title: "Nivel 3: Laberinto de Memoria",
        desc: "Meta al centro. Evita los bucles infinitos usando 'visited'.",
        agentStart: { r: 1, c: 1, dir: 1 },
        monsterStart: { r: -1, c: -1 },
        map: createMap([
            [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
            [1,4,0,0,0,0,0,1,0,0,0,0,0,0,1],
            [1,0,1,1,1,1,0,1,0,1,1,1,1,0,1],
            [1,0,1,0,0,0,0,0,0,0,0,0,1,0,1],
            [1,0,1,0,1,1,1,0,1,1,1,0,1,0,1],
            [1,0,0,0,1,0,0,0,0,0,1,0,0,0,1],
            [1,1,1,0,1,0,1,0,1,0,1,0,1,1,1],
            [1,0,0,0,0,0,0,5,0,0,0,0,0,0,1],
            [1,1,1,0,1,0,1,0,1,0,1,0,1,1,1],
            [1,0,0,0,1,0,0,0,0,0,1,0,0,0,1],
            [1,0,1,0,1,1,1,0,1,1,1,0,1,0,1],
            [1,0,1,0,0,0,0,0,0,0,0,0,1,0,1],
            [1,0,1,1,1,1,0,1,0,1,1,1,1,0,1],
            [1,0,0,0,0,0,0,1,0,0,0,0,0,0,1],
            [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
        ])
    },
    {
        id: 4,
        title: "Nivel 4: Peligro al Centro",
        desc: "Laberinto central con agujeros y gasolina. ¡Cuidado!",
        agentStart: { r: 1, c: 1, dir: 1 },
        monsterStart: { r: -1, c: -1 },
        map: createMap([
            [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
            [1,4,0,2,0,0,0,1,0,0,0,2,3,0,1],
            [1,0,1,1,1,1,0,1,0,1,1,1,1,0,1],
            [1,0,1,3,0,2,0,0,0,2,0,0,1,0,1],
            [1,0,1,0,1,1,1,0,1,1,1,0,1,0,1],
            [1,0,0,0,1,2,0,0,0,2,1,0,0,0,1],
            [1,1,1,0,1,0,1,0,1,0,1,0,1,1,1],
            [1,3,0,0,0,0,0,5,0,0,0,0,0,3,1],
            [1,1,1,0,1,0,1,0,1,0,1,0,1,1,1],
            [1,0,0,0,1,2,0,0,0,2,1,0,0,0,1],
            [1,0,1,0,1,1,1,0,1,1,1,0,1,0,1],
            [1,0,1,0,0,0,2,0,0,0,2,0,1,0,1],
            [1,0,1,1,1,1,0,1,0,1,1,1,1,0,1],
            [1,0,0,3,0,0,0,1,0,0,0,3,0,0,1],
            [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
        ])
    },
    {
        id: 5,
        title: "Nivel 5: El Guardián Estático",
        desc: "Un monstruo inmóvil bloquea el camino. ¡Dispara para pasar!",
        agentStart: { r: 1, c: 1, dir: 1 },
        monsterStart: { r: 7, c: 7 },
        staticMonster: true,
        map: createMap([
            [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
            [1,4,0,0,0,2,0,3,0,2,0,0,0,3,1], 
            [1,0,1,1,1,1,0,1,0,1,1,1,1,0,1],
            [1,0,1,3,0,0,0,0,0,0,0,0,1,0,1], 
            [1,0,1,0,1,1,1,0,1,1,1,0,1,0,1],
            [1,0,0,0,1,2,0,0,0,2,1,0,0,0,1], 
            [1,1,1,0,1,0,1,0,1,0,1,0,1,1,1],
            [1,3,0,0,0,0,0,5,0,0,0,0,0,3,1],
            [1,1,1,0,1,0,1,0,1,0,1,0,1,1,1],
            [1,0,0,0,1,2,0,0,0,2,1,0,0,0,1], 
            [1,0,1,0,1,1,1,0,1,1,1,0,1,0,1],
            [1,0,1,0,0,0,0,0,0,0,0,0,1,0,1], 
            [1,0,1,1,1,1,0,1,0,1,1,1,1,0,1],
            [1,0,3,0,0,0,0,3,0,0,0,0,0,0,1],
            [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
        ])
    }
];

export default function AgentGame() {
  const [currentLevelIdx, setCurrentLevelIdx] = useState(0);
  const [unlockedLevels, setUnlockedLevels] = useState(1);
  const [optimalMoves, setOptimalMoves] = useState(0);

  const [grid, setGrid] = useState(LEVELS[0].map);
  const [visited, setVisited] = useState([]);
  const [explored, setExplored] = useState([]);
  const [agent, setAgent] = useState({ ...LEVELS[0].agentStart, fuel: 100, alive: true, win: false });
  const [monster, setMonster] = useState(LEVELS[0].monsterStart);
  const [movesTaken, setMovesTaken] = useState(0);
  
  const [laserPath, setLaserPath] = useState([]);
  const [effects, setEffects] = useState([]); 
  const [isRunning, setIsRunning] = useState(false);
  const [userCode, setUserCode] = useState(DEFAULT_CODE);
  const [showCode, setShowCode] = useState(true);
  const [showHelp, setShowHelp] = useState(false); 
  const [scale, setScale] = useState(1);
  const [logs, setLogs] = useState(["Nivel 1 iniciado."]);
  const [gameTick, setGameTick] = useState(0);
  const [fogEnabled, setFogEnabled] = useState(false);
  const [gameOverReason, setGameOverReason] = useState(null);
  const [speed, setSpeed] = useState(500);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const intervalRef = useRef(null);
  const laserTimeoutRef = useRef(null);
  const textAreaRef = useRef(null);

  const addLog = (msg) => {
    setLogs(prev => [String(msg), ...prev].slice(0, 20));
  };

  const playSound = (type) => {
      if (!soundEnabled) return;
      SoundEngine.init();
      SoundEngine.play(type);
  };

  const handleToggleRun = () => {
      if (!isRunning) {
          SoundEngine.init();
      }
      setIsRunning(!isRunning);
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

  const getRelativeCoord = (r, c, dir, frontStep, rightStep) => {
    const d = ((dir % 4) + 4) % 4; 
    let dr = 0, dc = 0;
    if (d === 0) { dr = -frontStep; dc = rightStep; }       
    else if (d === 1) { dr = rightStep; dc = frontStep; }   
    else if (d === 2) { dr = frontStep; dc = -rightStep; }  
    else if (d === 3) { dr = -rightStep; dc = -frontStep; } 
    return { r: r + dr, c: c + dc };
  };

  const getCellColor = (r, c, type) => {
    const isExplored = explored.includes(`${r},${c}`);
    const isCurrentView = !fogEnabled || (Math.abs(agent.r - r) <= 1 && Math.abs(agent.c - c) <= 1);
    const isLaser = laserPath.some(p => p.r === r && p.c === c);
    
    if (isLaser) return "bg-red-500/50 border-red-400 animate-pulse z-30";
    if (!isCurrentView && !isExplored) return "bg-gray-950 border-gray-900"; 

    if (type === CELL.WALL) return "bg-slate-700 border-slate-600 shadow-inner";
    if (type === CELL.HOLE) return "bg-black border-red-900 shadow-[inset_0_0_10px_rgba(0,0,0,0.8)]";
    if (type === CELL.GOAL) return "bg-emerald-500/30 border-emerald-500 shadow-[inset_0_0_10px_rgba(16,185,129,0.4)]";
    
    return (r + c) % 2 === 0 ? "bg-slate-50 border-slate-200" : "bg-white border-slate-200";
  };

  const loadLevel = (idx) => {
      const levelData = LEVELS[idx];
      setIsRunning(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
      
      const newGrid = JSON.parse(JSON.stringify(levelData.map));
      setGrid(newGrid);
      setAgent({ ...levelData.agentStart, fuel: 100, alive: true, win: false });
      setMonster({ ...levelData.monsterStart, stun: 0 });
      setMovesTaken(0);
      setEffects([]);
      setSpeed(500);
      
      const startPos = `${levelData.agentStart.r},${levelData.agentStart.c}`;
      setVisited([startPos]);
      
      const initialVision = getVisionField(levelData.agentStart.r, levelData.agentStart.c);
      setExplored(initialVision);
      
      const optimal = calculateOptimalMoves(newGrid, levelData.agentStart);
      setOptimalMoves(optimal);
      
      setGameTick(0);
      setGameOverReason(null);
      setFogEnabled(false);
      setLaserPath([]);
      setLogs([`${levelData.title} cargado. Óptimo estimado: ${optimal} movs.`]);
      setCurrentLevelIdx(idx);
  };

  const resetGame = () => {
    loadLevel(currentLevelIdx);
    addLog("Simulación reiniciada.");
  };

  const handleNextLevel = () => {
      if (currentLevelIdx < LEVELS.length - 1) {
          const nextIdx = currentLevelIdx + 1;
          if (nextIdx + 1 > unlockedLevels) {
              setUnlockedLevels(nextIdx + 1);
          }
          loadLevel(nextIdx);
      }
  };

  const handleKeyDown = (e) => {
      if (e.key === 'Tab') {
          e.preventDefault();
          const start = e.target.selectionStart;
          const end = e.target.selectionEnd;
          const val = userCode;
          setUserCode(val.substring(0, start) + "  " + val.substring(end));
          setTimeout(() => {
              if(textAreaRef.current) {
                  textAreaRef.current.selectionStart = textAreaRef.current.selectionEnd = start + 2;
              }
          }, 0);
      }
  };

  const toggleSpeed = () => {
      setSpeed(prev => prev === 500 ? 100 : 500);
  };

  const runTurn = useCallback(() => {
    if (!agent.alive || agent.win || agent.fuel <= 0) {
      setIsRunning(false);
      return;
    }

    let newAgent = { ...agent };
    let newGrid = [...grid];
    let newMonster = { ...monster };
    let currentMoves = movesTaken;
    
    const directionsMap = {
        front: [1, 0], back: [-1, 0], left: [0, -1], right: [0, 1]
    };

    const sensors = {};
    Object.keys(directionsMap).forEach(key => {
        const [f, s] = directionsMap[key];
        const pos = getRelativeCoord(newAgent.r, newAgent.c, newAgent.dir, f, s);
        sensors[key] = getCellContent(pos.r, pos.c);
    });

    const feelBreeze = Object.values(directionsMap).some(([f,s]) => {
        const pos = getRelativeCoord(newAgent.r, newAgent.c, newAgent.dir, f, s);
        return grid[pos.r]?.[pos.c] === CELL.HOLE;
    });

    const smellGas = Object.values(directionsMap).some(([f,s]) => {
        const pos = getRelativeCoord(newAgent.r, newAgent.c, newAgent.dir, f, s);
        return grid[pos.r]?.[pos.c] === CELL.GAS;
    });

    let userAction = null;
    const moveFront = () => userAction = 'move';
    const turnLeft = () => userAction = 'left';
    const turnRight = () => userAction = 'right';
    const turnBack = () => userAction = 'back'; 
    const shoot = () => userAction = 'shoot';

    try {
      const userFunction = new Function(
        'sensor', 'smellGas', 'feelBreeze', 'moveFront', 'turnLeft', 'turnRight', 'turnBack', 'shoot', 
        userCode
      );
      userFunction(sensors, smellGas, feelBreeze, moveFront, turnLeft, turnRight, turnBack, shoot);
    } catch (e) {
      addLog(`Error runtime: ${e.message}`);
      setIsRunning(false);
      return;
    }

    let actionExecuted = false;
    if (userAction === 'move') {
      const nextPos = getRelativeCoord(newAgent.r, newAgent.c, newAgent.dir, 1, 0);
      const cellType = grid[nextPos.r]?.[nextPos.c];

      if (cellType === CELL.WALL) {
        addLog("¡Choque contra muro!");
        newAgent.fuel -= 5;
        playSound('bump');
      } else {
        newAgent.r = nextPos.r;
        newAgent.c = nextPos.c;
        newAgent.fuel -= 1;
        actionExecuted = true;
        playSound('move');

        if (cellType === CELL.HOLE) {
          newAgent.alive = false;
          setGameOverReason("Caíste en un agujero.");
          playSound('loss');
        } else if (cellType === CELL.GAS) {
          newAgent.fuel = Math.min(100, newAgent.fuel + 30);
          newGrid[newAgent.r][newAgent.c] = CELL.EMPTY;
          addLog("Gasolina recolectada (+30)");
          playSound('gas');
          
          const effectId = Date.now();
          setEffects(prev => [...prev, { r: newAgent.r, c: newAgent.c, id: effectId, type: 'star' }]);
          setTimeout(() => {
              setEffects(prev => prev.filter(e => e.id !== effectId));
          }, 1000);

        } else if (cellType === CELL.GOAL) {
          newAgent.win = true;
          if(currentLevelIdx + 1 === unlockedLevels && currentLevelIdx < LEVELS.length - 1) {
             setUnlockedLevels(u => u + 1);
          }
          setGameOverReason("¡Misión Cumplida!");
          playSound('win');
        }
      }
    } else if (userAction === 'left') {
      newAgent.dir -= 1;
      newAgent.fuel -= 1;
      actionExecuted = true;
      playSound('move');
    } else if (userAction === 'right') {
      newAgent.dir += 1;
      newAgent.fuel -= 1;
      actionExecuted = true;
      playSound('move');
    } else if (userAction === 'back') {
      newAgent.dir += 2;
      newAgent.fuel -= 1;
      actionExecuted = true;
      playSound('move');
    } else if (userAction === 'shoot') {
      newAgent.fuel -= 5;
      addLog("Disparo efectuado.");
      playSound('shoot');
      
      const path = [];
      for(let i=1; i<=3; i++) {
        const target = getRelativeCoord(newAgent.r, newAgent.c, newAgent.dir, i, 0);
        if(target.r >= 0 && target.r < GRID_SIZE && target.c >= 0 && target.c < GRID_SIZE) {
            path.push({r: target.r, c: target.c});
            if (target.r === monster.r && target.c === monster.c) {
                newMonster.r = -1;
                newMonster.c = -1;
                addLog("¡Monstruo eliminado!");
                playSound('bump');
                break; 
            }
            if(grid[target.r][target.c] === CELL.WALL) break;
        }
      }
      setLaserPath(path);
      if(laserTimeoutRef.current) clearTimeout(laserTimeoutRef.current);
      laserTimeoutRef.current = setTimeout(() => setLaserPath([]), 300);

    } else {
      newAgent.fuel -= 1;
    }

    if (actionExecuted) {
        currentMoves += 1;
        setMovesTaken(currentMoves);
    }

    setVisited(prev => {
        if (!prev.includes(`${newAgent.r},${newAgent.c}`)) {
            return [...prev, `${newAgent.r},${newAgent.c}`];
        }
        return prev;
    });

    const currentVision = getVisionField(newAgent.r, newAgent.c);
    setExplored(prev => {
        const uniqueExplored = new Set([...prev, ...currentVision]);
        return Array.from(uniqueExplored);
    });

    const currentLevel = LEVELS[currentLevelIdx];
    
    if (!currentLevel.staticMonster && newMonster.r !== -1 && newAgent.alive && !newAgent.win && (gameTick + 1) % 2 === 0 && newMonster.stun === 0) {
      const dr = newAgent.r - newMonster.r;
      const dc = newAgent.c - newMonster.c;
      let moveR = 0; 
      let moveC = 0;

      if (Math.abs(dr) > Math.abs(dc)) {
        moveR = Math.sign(dr);
      } else {
        moveC = Math.sign(dc);
      }

      const nextMr = newMonster.r + moveR;
      const nextMc = newMonster.c + moveC;
      
      if (grid[nextMr]?.[nextMc] !== CELL.WALL && grid[nextMr]?.[nextMc] !== CELL.HOLE) {
        newMonster.r = nextMr;
        newMonster.c = nextMc;
      }
    } else if (newMonster.stun > 0) {
        newMonster.stun--;
    }

    if (newAgent.r === newMonster.r && newAgent.c === newMonster.c) {
        newAgent.alive = false;
        setGameOverReason("El monstruo te ha comido.");
        playSound('loss');
    }

    if (newAgent.fuel <= 0) {
        newAgent.alive = false;
        setGameOverReason("Sin combustible.");
        playSound('loss');
    }

    setGrid(newGrid);
    setAgent(newAgent);
    setMonster(newMonster);
    setGameTick(t => t + 1);

  }, [agent, grid, monster, userCode, gameTick, currentLevelIdx, unlockedLevels, movesTaken, soundEnabled]);

  useEffect(() => {
    if (isRunning) {
        setFogEnabled(true);
        intervalRef.current = setInterval(runTurn, speed);
    } else {
        clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning, runTurn, speed]);

  useEffect(() => {
      loadLevel(0);
  }, []);

  const calculateEfficiency = () => {
      if (movesTaken === 0) return 0;
      const eff = Math.min(100, Math.round((optimalMoves / movesTaken) * 100));
      return eff;
  };

  const renderEntity = (r, c) => {
    const isCurrentView = !fogEnabled || (Math.abs(agent.r - r) <= 1 && Math.abs(agent.c - c) <= 1);
    const isExplored = explored.includes(`${r},${c}`);
    const isVisited = visited.includes(`${r},${c}`);
    
    const cellEffects = effects.filter(e => e.r === r && e.c === c);

    if (r === agent.r && c === agent.c) {
        return (
            <>
                {cellEffects.map(eff => (
                    <div key={eff.id} className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none animate-bounce">
                        <Sparkles className="w-8 h-8 text-yellow-300 drop-shadow-[0_0_5px_rgba(253,224,71,0.8)]" />
                    </div>
                ))}

                {isVisited && grid[r][c] !== CELL.GOAL && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
                         <X className="w-full h-full text-slate-800 p-1" />
                    </div>
                )}
                <div 
                    className="absolute inset-0 flex items-center justify-center transition-transform duration-300 z-20"
                    style={{ transform: `rotate(${agent.dir * 90}deg)` }}
                >
                    <div className="w-8 h-8 bg-blue-600 rounded-sm relative shadow-lg border-2 border-blue-400">
                        <div className="absolute -top-1 left-1 w-1 h-2 bg-yellow-300 shadow-[0_0_10px_rgba(253,224,71,0.8)]"></div>
                        <div className="absolute -top-1 right-1 w-1 h-2 bg-yellow-300 shadow-[0_0_10px_rgba(253,224,71,0.8)]"></div>
                        <div className="absolute top-2 left-1 right-1 h-2 bg-blue-300/50 rounded-sm"></div>
                    </div>
                </div>
            </>
        );
    }

    if (r === monster.r && c === monster.c && isCurrentView) {
        return (
            <div className="absolute inset-0 flex items-center justify-center z-10 animate-bounce">
                <Skull className={`w-8 h-8 ${monster.stun > 0 ? 'text-gray-400' : 'text-red-600'} drop-shadow-lg`} />
                {monster.stun > 0 && <div className="absolute -top-2 text-xs font-bold text-yellow-500">ZZz</div>}
            </div>
        );
    }

    if (cellEffects.length > 0) {
        return (
            <>
                {isVisited && grid[r][c] !== CELL.GOAL && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none z-0">
                         <X className="w-full h-full text-slate-800 p-1" />
                    </div>
                )}
                {cellEffects.map(eff => (
                    <div key={eff.id} className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none animate-bounce">
                        <Sparkles className="w-8 h-8 text-yellow-300 drop-shadow-[0_0_5px_rgba(253,224,71,0.8)]" />
                    </div>
                ))}
            </>
        );
    }

    if (!isCurrentView && !isExplored) return null;

    const opacityClass = !isCurrentView ? "opacity-50 grayscale" : ""; 
    const type = grid[r][c];

    const renderX = isVisited && type !== CELL.GOAL && type !== CELL.WALL ? (
        <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none z-0">
             <X className="w-full h-full text-slate-800 p-1" />
        </div>
    ) : null;

    if (type === CELL.GAS) return <>{renderX}<div className={`absolute inset-0 flex items-center justify-center z-10 ${opacityClass}`}><Fuel className="text-orange-500 w-6 h-6 drop-shadow-md" /></div></>;
    if (type === CELL.HOLE) return <div className={`absolute inset-0 flex items-center justify-center z-10 ${opacityClass}`}></div>;
    if (type === CELL.GOAL) return <div className={`absolute inset-0 flex items-center justify-center z-10 ${opacityClass}`}><Target className="text-emerald-600 w-8 h-8" /></div>;
    
    if (renderX) return renderX;

    return null;
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-100 font-sans overflow-hidden">
      <header className="h-16 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-4 z-30 shadow-md shrink-0">
        <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg shadow-blue-500/20 shadow-lg"><Code size={20} /></div>
            <div>
                <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-300 leading-tight">
                    Automata Override
                </h1>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>Nivel {currentLevelIdx + 1}/{LEVELS.length}</span>
                    <span className="w-1 h-1 rounded-full bg-slate-500"></span>
                    <span>{LEVELS[currentLevelIdx].title}</span>
                </div>
            </div>
        </div>

        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm bg-slate-900 px-3 py-1.5 rounded-md border border-slate-700 shadow-inner">
                <Fuel size={16} className={agent.fuel < 20 ? "text-red-500 animate-pulse" : "text-orange-400"} />
                <span className="font-mono w-8 text-right">{agent.fuel}</span>
            </div>
            
            <div className="h-6 w-px bg-slate-700 mx-2"></div>

            <button 
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="p-2 rounded-md transition-colors hover:bg-slate-700 text-slate-400 hover:text-white"
                title={soundEnabled ? "Silenciar" : "Activar Sonido"}
            >
                {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>

            <button 
                onClick={toggleSpeed}
                className={`p-2 rounded-md transition-colors shadow-lg ${speed === 100 ? 'bg-purple-600 text-white animate-pulse' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
                title={speed === 100 ? "Velocidad Normal" : "Modo Turbo"}
            >
                <FastForward size={18} />
            </button>

            <button 
                onClick={resetGame}
                className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-md transition-colors shadow-lg"
                title="Reiniciar Nivel"
            >
                <RefreshCw size={18} />
            </button>
            
            <button 
                onClick={handleToggleRun}
                disabled={!agent.alive || agent.win}
                className={`flex items-center gap-2 px-6 py-2 rounded-md font-bold transition-all shadow-lg ${
                    isRunning ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                } disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-700`}
            >
                {isRunning ? <><Pause size={18} /> DETENER</> : <><Play size={18} /> EJECUTAR</>}
            </button>
        </div>
      </header>

      <div className="flex-1 relative flex overflow-hidden">
        <div className="flex-1 bg-black relative overflow-auto flex items-center justify-center p-10">
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
                            className={`relative w-full h-full border box-border transition-colors duration-300 ${getCellColor(r, c, type)}`}
                        >
                            <div className="absolute inset-0 opacity-5 pointer-events-none border border-white/10"></div>
                            {renderEntity(r, c)}
                        </div>
                    )))}
                </div>
            </div>

            <div className="absolute bottom-6 left-6 flex gap-2 bg-slate-800 p-2 rounded-lg shadow-lg border border-slate-700 z-30">
                <button onClick={() => setScale(s => Math.max(0.5, s - 0.1))} className="p-2 hover:bg-slate-700 rounded text-slate-400 hover:text-white"><ZoomOut size={18} /></button>
                <button onClick={() => setScale(s => Math.min(2, s + 0.1))} className="p-2 hover:bg-slate-700 rounded text-slate-400 hover:text-white"><ZoomIn size={18} /></button>
            </div>

            {!agent.alive && (
                <div className="absolute inset-0 bg-black/80 flex items-center justify-center backdrop-blur-sm z-50 animate-in fade-in duration-300">
                    <div className="bg-slate-900 p-8 rounded-2xl border border-red-500/50 text-center max-w-md shadow-2xl relative overflow-hidden">
                        <div className="absolute inset-0 bg-red-500/10 animate-pulse pointer-events-none"></div>
                        <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4 relative z-10" />
                        <h2 className="text-3xl font-bold text-white mb-2 relative z-10">FALLO DEL SISTEMA</h2>
                        <p className="text-red-300 mb-6 relative z-10 font-mono">{gameOverReason}</p>
                        <button onClick={resetGame} className="relative z-10 px-8 py-3 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold transition-transform hover:scale-105 shadow-lg shadow-red-900/50 flex items-center gap-2 mx-auto">
                            <RefreshCw size={18}/> Reintentar
                        </button>
                    </div>
                </div>
            )}
            
            {agent.win && (
                <div className="absolute inset-0 bg-black/80 flex items-center justify-center backdrop-blur-sm z-50 animate-in fade-in duration-300">
                    <div className="bg-slate-900 p-8 rounded-2xl border border-green-500/50 text-center max-w-md shadow-2xl relative overflow-hidden">
                        <div className="absolute inset-0 bg-green-500/10 animate-pulse pointer-events-none"></div>
                        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4 relative z-10" />
                        <h2 className="text-3xl font-bold text-white mb-2 relative z-10">OBJETIVO LOGRADO</h2>
                        <div className="grid grid-cols-2 gap-4 mb-6 relative z-10 text-left bg-slate-800/50 p-4 rounded-lg">
                            <div>
                                <p className="text-xs text-slate-400 uppercase">Combustible</p>
                                <p className="text-xl font-mono text-orange-400">{agent.fuel}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-400 uppercase">Eficiencia</p>
                                <p className={`text-xl font-mono ${calculateEfficiency() === 100 ? 'text-green-400' : 'text-yellow-400'}`}>
                                    {calculateEfficiency()}%
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-3 justify-center relative z-10">
                            <button onClick={resetGame} className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors">
                                Repetir
                            </button>
                            {currentLevelIdx < LEVELS.length - 1 ? (
                                <button onClick={handleNextLevel} className="px-6 py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold transition-transform hover:scale-105 shadow-lg shadow-green-900/50 flex items-center gap-2">
                                    Siguiente Nivel <ChevronRight size={18}/>
                                </button>
                            ) : (
                                <div className="px-6 py-3 bg-yellow-600 text-white rounded-lg font-bold shadow-lg flex items-center gap-2">
                                    ¡JUEGO COMPLETADO!
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>

        <div className={`absolute top-4 left-4 bottom-4 w-[500px] md:w-[600px] bg-slate-900/95 backdrop-blur border border-slate-700 shadow-2xl flex flex-col transition-transform duration-300 rounded-xl overflow-hidden z-40 ${showCode ? 'translate-x-0' : '-translate-x-[620px]'}`}>
            <div className="bg-slate-800 p-3 flex justify-between items-center border-b border-slate-700">
                <span className="font-mono text-sm text-blue-400 font-bold flex items-center gap-2">
                    <Code size={16}/> main.js
                </span>
                <div className="flex gap-2">
                    <button onClick={() => setShowHelp(!showHelp)} className={`p-1 rounded hover:bg-slate-700 ${showHelp ? 'text-blue-400' : 'text-slate-400'}`}>
                        <HelpCircle size={18} />
                    </button>
                    <button onClick={() => setShowCode(false)} className="text-slate-400 hover:text-white p-1 hover:bg-slate-700 rounded">
                        <ChevronLeft size={18}/>
                    </button>
                </div>
            </div>
            
            <div className="flex-1 relative group flex flex-col">
                {showHelp && (
                    <div className="absolute inset-0 bg-slate-900/95 z-20 p-6 overflow-y-auto backdrop-blur-sm animate-in fade-in">
                        <h3 className="text-xl font-bold text-blue-400 mb-4 flex items-center gap-2"><Code size={20}/> Referencia API</h3>
                        
                        <div className="space-y-6 text-sm text-slate-300">
                            <section>
                                <h4 className="text-white font-bold mb-2 border-b border-slate-700 pb-1">Comandos Disponibles</h4>
                                <ul className="space-y-2 font-mono text-xs">
                                    <li className="flex gap-2"><span className="text-purple-400">moveFront()</span> <span>Avanza 1 casilla en la dirección actual.</span></li>
                                    <li className="flex gap-2"><span className="text-purple-400">turnLeft()</span> <span>Gira 90° a la izquierda (Sin avanzar).</span></li>
                                    <li className="flex gap-2"><span className="text-purple-400">turnRight()</span> <span>Gira 90° a la derecha (Sin avanzar).</span></li>
                                    <li className="flex gap-2"><span className="text-purple-400">turnBack()</span> <span>Gira 180° (media vuelta).</span></li>
                                    <li className="flex gap-2"><span className="text-purple-400">shoot()</span> <span>Dispara láser 3 casillas al frente.</span></li>
                                </ul>
                            </section>

                            <section>
                                <h4 className="text-white font-bold mb-2 border-b border-slate-700 pb-1">Sensores</h4>
                                <p className="mb-2 text-xs">Accede al contenido de las celdas relativas al auto:</p>
                                <ul className="grid grid-cols-2 gap-2 font-mono text-xs">
                                    <li><span className="text-orange-400">sensor.front</span></li>
                                    <li><span className="text-orange-400">sensor.back</span></li>
                                    <li><span className="text-orange-400">sensor.left</span></li>
                                    <li><span className="text-orange-400">sensor.right</span></li>
                                </ul>
                            </section>

                            <section>
                                <h4 className="text-white font-bold mb-2 border-b border-slate-700 pb-1">Tipos de Contenido</h4>
                                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                                    <span className="text-emerald-400">'empty'</span>
                                    <span className="text-slate-500">'wall'</span>
                                    <span className="text-red-500">'hole'</span>
                                    <span className="text-orange-500">'gas'</span>
                                    <span className="text-red-400">'monster'</span>
                                    <span className="text-green-400">'goal'</span>
                                    <span className="text-blue-300">'visited'</span>
                                </div>
                            </section>

                            <section>
                                <h4 className="text-white font-bold mb-2 border-b border-slate-700 pb-1">Estado Ambiental</h4>
                                <ul className="space-y-1 font-mono text-xs">
                                    <li><span className="text-yellow-400">smellGas</span> (boolean) - Gasolina cerca.</li>
                                    <li><span className="text-blue-400">feelBreeze</span> (boolean) - Agujero cerca.</li>
                                </ul>
                            </section>
                        </div>
                        
                        <button onClick={() => setShowHelp(false)} className="mt-6 w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold">Entendido</button>
                    </div>
                )}

                <textarea 
                    ref={textAreaRef}
                    className="w-full h-full bg-[#0d1117] text-slate-300 font-mono text-xs sm:text-sm p-4 focus:outline-none resize-none leading-relaxed tab-size-2"
                    value={userCode}
                    onChange={(e) => setUserCode(e.target.value)}
                    onKeyDown={handleKeyDown}
                    spellCheck="false"
                    placeholder="// Escribe tu código aquí..."
                />
            </div>
            
            <div className="h-40 bg-slate-950 border-t border-slate-800 flex flex-col">
                <div className="px-3 py-1 bg-slate-900 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-800 flex justify-between">
                    <span>Terminal Output</span>
                    <span className="text-slate-600">v1.0.8</span>
                </div>
                <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-1 scrollbar-thin scrollbar-thumb-slate-700">
                    {logs.map((log, i) => (
                        <div key={i} className="text-slate-400 border-l-2 border-slate-700 pl-2">
                            <span className="text-slate-600 mr-2">[{logs.length - i}]</span>{log}
                        </div>
                    ))}
                </div>
            </div>
        </div>

        <button 
            onClick={() => setShowCode(!showCode)}
            className={`absolute top-8 left-0 bg-blue-600 text-white p-3 rounded-r-lg shadow-lg hover:bg-blue-500 transition-all z-40 ${showCode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        >
            <ChevronRight size={24} />
        </button>

        <div className="absolute bottom-6 right-6 bg-slate-900/90 backdrop-blur p-4 rounded-xl border border-slate-700 shadow-xl text-xs w-48">
            <h3 className="text-slate-400 font-bold mb-2 uppercase tracking-wider flex items-center gap-2 border-b border-slate-700 pb-1"><Zap size={12}/> Sensores</h3>
            <div className="space-y-2 text-slate-300">
               <div className={`flex items-center justify-between p-1 rounded ${logs[0]?.includes('hole') ? 'bg-red-900/30' : ''}`}>
                   <span>feelBreeze</span>
                   <span className={grid[agent.r]?.[agent.c] === CELL.HOLE || logs[0]?.includes('hole') ? 'text-red-400 font-bold' : 'text-slate-500'}>
                       {grid[agent.r]?.[agent.c] === CELL.HOLE ? 'CRITICAL' : 'SAFE'}
                   </span>
               </div>
               <div className={`flex items-center justify-between p-1 rounded ${logs[0]?.includes('gas') ? 'bg-orange-900/30' : ''}`}>
                   <span>smellGas</span>
                   <span className={grid[agent.r]?.[agent.c] === CELL.GAS || logs[0]?.includes('gas') ? 'text-orange-400 font-bold' : 'text-slate-500'}>
                       {grid[agent.r]?.[agent.c] === CELL.GAS ? 'DETECTED' : 'NONE'}
                   </span>
               </div>
               <div className="mt-2 pt-2 border-t border-slate-700">
                   <div className="text-[10px] text-slate-500 mb-1">FRONT SENSOR</div>
                   <div className="font-mono bg-slate-800 px-2 py-1 rounded text-cyan-400 text-center">
                       "{getCellContent(
                           getRelativeCoord(agent.r, agent.c, agent.dir, 1, 0).r,
                           getRelativeCoord(agent.r, agent.c, agent.dir, 1, 0).c
                       )}"
                   </div>
               </div>
            </div>
        </div>

      </div>
    </div>
  );
}
