/**
 * Arena — 場景環境（地面 + 碎片 + 粒子 + 燈光 + 天空）
 *
 * 三種場景模式：
 * - story: 廢土雨夜（棕色地面 + 雨 + 紅色火花 + 暖霧）
 * - tower: 冰封高塔（藍灰冰面 + 飄雪 + 藍色光點 + 冷霧）
 * - daily: 熔岩地獄（深紅地面 + 飛灰 + 橙色火花 + 暗紅霧）
 *
 * 五者連動：Ground / Debris / Particles / Sparkles / Fog
 */

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sky, Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import type { DebrisItem, DebrisType } from '../types'
import { SceneProps } from './SceneProps'

export type SceneMode = 'story' | 'tower' | 'daily' | 'pvp' | 'boss' | 'city' | 'forest' | 'wasteland' | 'factory' | 'hospital' | 'residential' | 'underground' | 'core'

/* ════════════════════════════════════
   場景配色表
   ════════════════════════════════════ */

interface SceneTheme {
  fogColor: string
  fogNear: number
  fogFar: number
  sparkleColor: string
  sparkleCount: number
  skyConfig: { sunY: number; rayleigh: number; turbidity: number }
  hemiArgs: [string, string]
  hemiIntensity: number
  ambientIntensity: number
  pointLights: { pos: [number, number, number]; color: string; intensity: number }[]
  dirLights: { pos: [number, number, number]; color: string; intensity: number }[]
  particleType: 'rain' | 'snow' | 'ash'
  particleColor: string
  particleOpacity: number
  groundColorFn: (v: number, brownMix: number) => [number, number, number]
  wallColors: Record<string, string[]>
  rubbleColors: Record<string, string[]>
  groundRoughness: number
  groundMetalness: number
}

const pvpTheme: SceneTheme = {
  fogColor: '#0a0a1e', fogNear: 6, fogFar: 32,
  sparkleColor: '#6688ff', sparkleCount: 100,
  skyConfig: { sunY: -0.1, rayleigh: 0.3, turbidity: 15 },
  hemiArgs: ['#4466ff', '#110033'], hemiIntensity: 1.4,
  ambientIntensity: 2.8,
  pointLights: [
    { pos: [15, 10, 10], color: '#4488ff', intensity: 45 },
    { pos: [-15, 12, -10], color: '#6644ff', intensity: 35 },
    { pos: [0, 15, 5], color: '#ffffff', intensity: 20 },
  ],
  dirLights: [
    { pos: [5, 25, 15], color: '#aaccff', intensity: 5 },
    { pos: [-5, 20, 10], color: '#8866ff', intensity: 3 },
  ],
  particleType: 'ash', particleColor: '#6688ff', particleOpacity: 0.4,
  groundColorFn: (v, bm) => [
    (0.08 + bm * 0.05) * v,
    (0.08 + bm * 0.05) * v,
    (0.16 + bm * 0.10) * v,
  ],
  wallColors: {
    slab: ['#606080', '#505070', '#707090', '#808098'],
    box: ['#303050', '#404060', '#252545'],
    pillar: ['#505068', '#404058', '#606078'],
  },
  rubbleColors: {
    rock: ['#404060', '#505070', '#353555'],
    pipe: ['#556688', '#667799'],
    small: ['#454565', '#555575'],
  },
  groundRoughness: 0.85,
  groundMetalness: 0.15,
}

const bossTheme: SceneTheme = {
  fogColor: '#1a0808', fogNear: 6, fogFar: 30,
  sparkleColor: '#ff3333', sparkleCount: 120,
  skyConfig: { sunY: -0.2, rayleigh: 0.15, turbidity: 25 },
  hemiArgs: ['#ff2200', '#330000'], hemiIntensity: 1.6,
  ambientIntensity: 3.0,
  pointLights: [
    { pos: [15, 10, 10], color: '#ff3300', intensity: 50 },
    { pos: [-15, 12, -10], color: '#ff0000', intensity: 40 },
    { pos: [0, 15, 5], color: '#ff8800', intensity: 30 },
  ],
  dirLights: [
    { pos: [5, 25, 15], color: '#ff6644', intensity: 6 },
    { pos: [-5, 20, 10], color: '#ff4422', intensity: 4 },
  ],
  particleType: 'ash', particleColor: '#ff4400', particleOpacity: 0.5,
  groundColorFn: (v, bm) => [
    (0.20 + bm * 0.12) * v,
    (0.06 + bm * 0.03) * v,
    (0.04 + bm * 0.02) * v,
  ],
  wallColors: {
    slab: ['#8a605a', '#7e5048', '#9c7068', '#a07860'],
    box: ['#5a2820', '#6b3423', '#4a2018'],
    pillar: ['#706058', '#585048', '#907870'],
  },
  rubbleColors: {
    rock: ['#604838', '#785840', '#504028'],
    pipe: ['#886644', '#997755'],
    small: ['#553322', '#664433'],
  },
  groundRoughness: 0.95,
  groundMetalness: 0.05,
}

const THEMES: Record<SceneMode, SceneTheme> = {
  /* ── 主線：廢土雨夜 ── */
  story: {
    fogColor: '#1a0e06', fogNear: 8, fogFar: 35,
    sparkleColor: '#ff6666', sparkleCount: 80,
    skyConfig: { sunY: -0.15, rayleigh: 0.2, turbidity: 20 },
    hemiArgs: ['#ff4400', '#220000'], hemiIntensity: 1.2,
    ambientIntensity: 2.5,
    pointLights: [
      { pos: [15, 10, 10], color: '#ff6633', intensity: 40 },
      { pos: [-15, 12, -10], color: '#ff2200', intensity: 30 },
      { pos: [0, 15, 5], color: '#ffffff', intensity: 25 },
    ],
    dirLights: [
      { pos: [5, 25, 15], color: '#ffffff', intensity: 5 },
      { pos: [-5, 20, 10], color: '#ff8866', intensity: 3 },
    ],
    particleType: 'rain', particleColor: '#99aabb', particleOpacity: 0.35,
    groundColorFn: (v, bm) => [
      (0.16 + bm * 0.10) * v,
      (0.11 + bm * 0.06) * v,
      (0.06 + bm * 0.03) * v,
    ],
    wallColors: {
      slab: ['#8a8078', '#6e6258', '#9c8e80', '#b0a090'],
      box: ['#5a4030', '#6b4423', '#4a3018'],
      pillar: ['#707068', '#585850', '#908880'],
    },
    rubbleColors: {
      rock: ['#605848', '#787060', '#504838'],
      chunk: ['#8b4513', '#a0522d', '#6b3410'],
      slab: ['#989088', '#807870', '#a8a098'],
      box: ['#5c4a38', '#4a3828', '#6e5c48'],
      rebar: ['#b87333', '#c08040', '#8b5a2b', '#d4874a'],
    },
    groundRoughness: 0.95, groundMetalness: 0.0,
  },

  /* ── 爬塔：冰封高塔 ── */
  tower: {
    fogColor: '#1a2540', fogNear: 12, fogFar: 42,
    sparkleColor: '#88ccff', sparkleCount: 100,
    skyConfig: { sunY: -0.15, rayleigh: 0.6, turbidity: 5 },
    hemiArgs: ['#6699dd', '#182040'], hemiIntensity: 1.8,
    ambientIntensity: 3.5,
    pointLights: [
      { pos: [12, 12, 8], color: '#88aaff', intensity: 55 },
      { pos: [-12, 10, -8], color: '#6688dd', intensity: 40 },
      { pos: [0, 18, 0], color: '#ccddff', intensity: 35 },
    ],
    dirLights: [
      { pos: [6, 25, 12], color: '#ddeeff', intensity: 6 },
      { pos: [-4, 20, 8], color: '#88aacc', intensity: 4 },
    ],
    particleType: 'snow', particleColor: '#ddeeff', particleOpacity: 0.5,
    groundColorFn: (v, bm) => [
      (0.12 + bm * 0.06) * v,
      (0.15 + bm * 0.08) * v,
      (0.22 + bm * 0.10) * v,
    ],
    wallColors: {
      slab: ['#8090a0', '#708090', '#90a0b0', '#a0b0c0'],
      box: ['#506070', '#607080', '#405060'],
      pillar: ['#9aa8b8', '#7888a0', '#b0c0d0'],
    },
    rubbleColors: {
      rock: ['#607080', '#506070', '#708898'],
      chunk: ['#5a7088', '#6080a0', '#4a6078'],
      slab: ['#8898a8', '#7888a0', '#98a8c0'],
      box: ['#405868', '#506878', '#607088'],
      rebar: ['#667788', '#778899', '#5a6a7a'],
    },
    groundRoughness: 0.7, groundMetalness: 0.15,
  },

  /* ── 每日副本：熔岩地獄 ── */
  daily: {
    fogColor: '#2a1208', fogNear: 9, fogFar: 36,
    sparkleColor: '#ff4400', sparkleCount: 120,
    skyConfig: { sunY: 0.0, rayleigh: 0.1, turbidity: 30 },
    hemiArgs: ['#ff6633', '#1a0800'], hemiIntensity: 2.2,
    ambientIntensity: 3.5,
    pointLights: [
      { pos: [10, 8, 8], color: '#ff6633', intensity: 65 },
      { pos: [-10, 10, -6], color: '#ff4422', intensity: 50 },
      { pos: [0, 12, 0], color: '#ffcc66', intensity: 40 },
    ],
    dirLights: [
      { pos: [4, 22, 14], color: '#ffaa66', intensity: 6 },
      { pos: [-6, 18, 8], color: '#ff6644', intensity: 4.5 },
    ],
    particleType: 'ash', particleColor: '#ff6633', particleOpacity: 0.4,
    groundColorFn: (v, bm) => [
      (0.22 + bm * 0.12) * v,
      (0.06 + bm * 0.03) * v,
      (0.02 + bm * 0.01) * v,
    ],
    wallColors: {
      slab: ['#3a2018', '#4a2820', '#5a3028', '#302018'],
      box: ['#2a1008', '#3a1810', '#1a0800'],
      pillar: ['#484040', '#383030', '#584848'],
    },
    rubbleColors: {
      rock: ['#3a2018', '#4a2820', '#2a1810'],
      chunk: ['#582010', '#481808', '#681808'],
      slab: ['#484038', '#383028', '#58483a'],
      box: ['#3a2818', '#2a1808', '#4a3020'],
      rebar: ['#604030', '#704838', '#503828'],
    },
    groundRoughness: 0.9, groundMetalness: 0.05,
  },
  /* ── PvP 競技場：冷藍電光 ── */
  pvp: pvpTheme,
  /* ── Boss 挑戰：煉獄深紅 ── */
  boss: bossTheme,

  /* ── 章節專屬場景 ── */
  // city = story (廢墟之城，共用廢土雨夜)
  city: {
    fogColor: '#1a0e06', fogNear: 8, fogFar: 35,
    sparkleColor: '#ff6666', sparkleCount: 80,
    skyConfig: { sunY: -0.15, rayleigh: 0.2, turbidity: 20 },
    hemiArgs: ['#ff4400', '#220000'], hemiIntensity: 1.2,
    ambientIntensity: 2.5,
    pointLights: [
      { pos: [15, 10, 10], color: '#ff6633', intensity: 40 },
      { pos: [-15, 12, -10], color: '#ff2200', intensity: 30 },
      { pos: [0, 15, 5], color: '#ffffff', intensity: 25 },
    ],
    dirLights: [
      { pos: [5, 25, 15], color: '#ffffff', intensity: 5 },
      { pos: [-5, 20, 10], color: '#ff8866', intensity: 3 },
    ],
    particleType: 'rain', particleColor: '#99aabb', particleOpacity: 0.35,
    groundColorFn: (v, bm) => [(0.18 + bm * 0.10) * v, (0.12 + bm * 0.06) * v, (0.07 + bm * 0.03) * v],
    wallColors: { slab: ['#8a8078', '#6e6258', '#9c8e80', '#b0a090'], box: ['#5a4030', '#6b4423', '#4a3018'], pillar: ['#707068', '#585850', '#908880'] },
    rubbleColors: { rock: ['#605848', '#787060', '#504838'], chunk: ['#8b4513', '#a0522d', '#6b3410'], slab: ['#989088', '#807870', '#a8a098'], box: ['#5c4a38', '#4a3828', '#6e5c48'], rebar: ['#b87333', '#c08040', '#8b5a2b', '#d4874a'] },
    groundRoughness: 0.95, groundMetalness: 0.0,
  },
  // forest = 暗夜森林（深綠色調）
  forest: {
    fogColor: '#0a1a0a', fogNear: 6, fogFar: 30,
    sparkleColor: '#44ff66', sparkleCount: 100,
    skyConfig: { sunY: -0.25, rayleigh: 0.3, turbidity: 15 },
    hemiArgs: ['#225522', '#0a0f0a'], hemiIntensity: 1.5,
    ambientIntensity: 2.0,
    pointLights: [
      { pos: [12, 10, 8], color: '#44aa44', intensity: 35 },
      { pos: [-12, 12, -8], color: '#226622', intensity: 25 },
      { pos: [0, 15, 0], color: '#aaddaa', intensity: 30 },
    ],
    dirLights: [
      { pos: [5, 25, 15], color: '#ccddcc', intensity: 4 },
      { pos: [-5, 20, 10], color: '#448844', intensity: 2.5 },
    ],
    particleType: 'rain', particleColor: '#88bb88', particleOpacity: 0.25,
    groundColorFn: (v, bm) => [(0.06 + bm * 0.04) * v, (0.14 + bm * 0.08) * v, (0.05 + bm * 0.03) * v],
    wallColors: { slab: ['#4a5a40', '#3a4a30', '#5a6a50', '#6a7a60'], box: ['#2a3a20', '#3a4a28', '#1a2a10'], pillar: ['#5a6858', '#4a5848', '#6a7868'] },
    rubbleColors: { rock: ['#3a4a30', '#4a5a40', '#2a3a20'], chunk: ['#4b5a2d', '#5a6b3d', '#3b4a1d'], slab: ['#5a6a58', '#4a5a48', '#6a7a68'], box: ['#3a4a28', '#2a3a18', '#4a5a38'], rebar: ['#556633', '#668844', '#445522'] },
    groundRoughness: 0.9, groundMetalness: 0.0,
  },
  // wasteland = 死寂荒原（黃土沙色） 
  wasteland: {
    fogColor: '#2a1e0a', fogNear: 10, fogFar: 38,
    sparkleColor: '#ddaa44', sparkleCount: 60,
    skyConfig: { sunY: 0.1, rayleigh: 0.8, turbidity: 25 },
    hemiArgs: ['#ccaa66', '#2a1a08'], hemiIntensity: 1.8,
    ambientIntensity: 3.0,
    pointLights: [
      { pos: [14, 12, 10], color: '#ddbb66', intensity: 45 },
      { pos: [-14, 10, -8], color: '#bb8833', intensity: 30 },
      { pos: [0, 16, 0], color: '#ffeedd', intensity: 28 },
    ],
    dirLights: [
      { pos: [6, 28, 12], color: '#ffeedd', intensity: 6 },
      { pos: [-4, 20, 8], color: '#ddaa66', intensity: 3 },
    ],
    particleType: 'ash', particleColor: '#ccaa66', particleOpacity: 0.3,
    groundColorFn: (v, bm) => [(0.22 + bm * 0.10) * v, (0.16 + bm * 0.06) * v, (0.08 + bm * 0.03) * v],
    wallColors: { slab: ['#aa9060', '#8a7050', '#bb9a70', '#cca880'], box: ['#6a5030', '#7a5a38', '#5a4020'], pillar: ['#9a8868', '#8a7858', '#aa9878'] },
    rubbleColors: { rock: ['#7a6840', '#8a7850', '#6a5830'], chunk: ['#8a6520', '#9a7530', '#7a5510'], slab: ['#9a9078', '#8a8068', '#aa9a88'], box: ['#6a5838', '#5a4828', '#7a6848'], rebar: ['#aa8040', '#bb9050', '#997030'] },
    groundRoughness: 0.95, groundMetalness: 0.02,
  },
  // factory = 工業廢墟（冷灰鐵銹）
  factory: {
    fogColor: '#151820', fogNear: 8, fogFar: 32,
    sparkleColor: '#ff8844', sparkleCount: 70,
    skyConfig: { sunY: -0.1, rayleigh: 0.15, turbidity: 18 },
    hemiArgs: ['#888899', '#1a1a22'], hemiIntensity: 1.4,
    ambientIntensity: 2.8,
    pointLights: [
      { pos: [12, 10, 8], color: '#ffaa44', intensity: 40 },
      { pos: [-12, 12, -8], color: '#ff6622', intensity: 30 },
      { pos: [0, 16, 0], color: '#ddddee', intensity: 25 },
    ],
    dirLights: [
      { pos: [5, 25, 15], color: '#dddde0', intensity: 5 },
      { pos: [-5, 20, 10], color: '#aa8866', intensity: 3 },
    ],
    particleType: 'ash', particleColor: '#888888', particleOpacity: 0.3,
    groundColorFn: (v, bm) => [(0.14 + bm * 0.06) * v, (0.13 + bm * 0.05) * v, (0.14 + bm * 0.06) * v],
    wallColors: { slab: ['#606068', '#505058', '#707078', '#808088'], box: ['#3a3a42', '#4a4a52', '#2a2a32'], pillar: ['#787880', '#686870', '#888890'] },
    rubbleColors: { rock: ['#505058', '#606068', '#404048'], chunk: ['#5a4030', '#6a5040', '#4a3020'], slab: ['#707078', '#606068', '#808088'], box: ['#404048', '#303038', '#505058'], rebar: ['#b87333', '#c08040', '#a06030', '#d08848'] },
    groundRoughness: 0.8, groundMetalness: 0.2,
  },
  // hospital = 沉默醫院（慘白冷光）
  hospital: {
    fogColor: '#161820', fogNear: 8, fogFar: 30,
    sparkleColor: '#88ccff', sparkleCount: 50,
    skyConfig: { sunY: -0.2, rayleigh: 0.1, turbidity: 8 },
    hemiArgs: ['#aabbcc', '#181820'], hemiIntensity: 1.8,
    ambientIntensity: 3.5,
    pointLights: [
      { pos: [10, 10, 8], color: '#ccddff', intensity: 45 },
      { pos: [-10, 12, -8], color: '#88aacc', intensity: 30 },
      { pos: [0, 14, 0], color: '#ffffff', intensity: 35 },
    ],
    dirLights: [
      { pos: [5, 25, 15], color: '#eeeeff', intensity: 5.5 },
      { pos: [-5, 20, 10], color: '#aabbcc', intensity: 3 },
    ],
    particleType: 'ash', particleColor: '#bbccdd', particleOpacity: 0.2,
    groundColorFn: (v, bm) => [(0.16 + bm * 0.06) * v, (0.17 + bm * 0.06) * v, (0.20 + bm * 0.08) * v],
    wallColors: { slab: ['#889098', '#788088', '#9aa0a8', '#aab0b8'], box: ['#506068', '#607078', '#405058'], pillar: ['#90989a', '#808890', '#a0a8aa'] },
    rubbleColors: { rock: ['#606870', '#707880', '#505860'], chunk: ['#556068', '#607080', '#456058'], slab: ['#808890', '#709098', '#90a0a8'], box: ['#405058', '#304048', '#506068'], rebar: ['#667788', '#778899', '#556677'] },
    groundRoughness: 0.7, groundMetalness: 0.1,
  },
  // residential = 廢棄住宅區（暖黃破敗）
  residential: {
    fogColor: '#1a1408', fogNear: 7, fogFar: 32,
    sparkleColor: '#ffdd88', sparkleCount: 60,
    skyConfig: { sunY: -0.1, rayleigh: 0.3, turbidity: 16 },
    hemiArgs: ['#cc9944', '#1a1208'], hemiIntensity: 1.3,
    ambientIntensity: 2.5,
    pointLights: [
      { pos: [12, 10, 8], color: '#ffcc66', intensity: 38 },
      { pos: [-12, 12, -8], color: '#cc8833', intensity: 28 },
      { pos: [0, 15, 0], color: '#ffeedd', intensity: 30 },
    ],
    dirLights: [
      { pos: [5, 25, 15], color: '#ffeedd', intensity: 5 },
      { pos: [-5, 20, 10], color: '#ccaa66', intensity: 2.5 },
    ],
    particleType: 'ash', particleColor: '#aa8844', particleOpacity: 0.25,
    groundColorFn: (v, bm) => [(0.18 + bm * 0.08) * v, (0.14 + bm * 0.06) * v, (0.08 + bm * 0.04) * v],
    wallColors: { slab: ['#8a7848', '#7a6838', '#9a8858', '#aa9868'], box: ['#5a4828', '#6a5838', '#4a3818'], pillar: ['#887860', '#787050', '#988870'] },
    rubbleColors: { rock: ['#6a5838', '#7a6848', '#5a4828'], chunk: ['#7a5830', '#8a6840', '#6a4820'], slab: ['#8a8068', '#7a7058', '#9a9078'], box: ['#5a4828', '#4a3818', '#6a5838'], rebar: ['#aa7830', '#bb8840', '#996820'] },
    groundRoughness: 0.9, groundMetalness: 0.0,
  },
  // underground = 地下交通網（深暗幽冷）
  underground: {
    fogColor: '#0a0c14', fogNear: 5, fogFar: 28,
    sparkleColor: '#66aaff', sparkleCount: 40,
    skyConfig: { sunY: -0.5, rayleigh: 0.05, turbidity: 2 },
    hemiArgs: ['#445566', '#080810'], hemiIntensity: 1.0,
    ambientIntensity: 2.2,
    pointLights: [
      { pos: [10, 8, 8], color: '#aaddff', intensity: 50 },
      { pos: [-10, 10, -6], color: '#6688aa', intensity: 35 },
      { pos: [0, 12, 0], color: '#ffffff', intensity: 30 },
    ],
    dirLights: [
      { pos: [4, 20, 12], color: '#ccddee', intensity: 4 },
      { pos: [-4, 18, 8], color: '#6688aa', intensity: 2 },
    ],
    particleType: 'ash', particleColor: '#556677', particleOpacity: 0.2,
    groundColorFn: (v, bm) => [(0.10 + bm * 0.04) * v, (0.11 + bm * 0.04) * v, (0.14 + bm * 0.06) * v],
    wallColors: { slab: ['#404858', '#354050', '#505868', '#606878'], box: ['#2a3040', '#3a4050', '#1a2030'], pillar: ['#586070', '#486060', '#687080'] },
    rubbleColors: { rock: ['#384050', '#485060', '#283040'], chunk: ['#3a4858', '#4a5868', '#2a3848'], slab: ['#586070', '#486060', '#687080'], box: ['#283040', '#182030', '#384050'], rebar: ['#556070', '#667080', '#445060'] },
    groundRoughness: 0.75, groundMetalness: 0.15,
  },
  // core = 末日核心（紫紅高能）
  core: {
    fogColor: '#1a0820', fogNear: 6, fogFar: 30,
    sparkleColor: '#ff44ff', sparkleCount: 120,
    skyConfig: { sunY: 0.0, rayleigh: 0.1, turbidity: 28 },
    hemiArgs: ['#aa44aa', '#100818'], hemiIntensity: 2.0,
    ambientIntensity: 3.2,
    pointLights: [
      { pos: [10, 10, 8], color: '#ff66ff', intensity: 55 },
      { pos: [-10, 12, -8], color: '#aa22aa', intensity: 40 },
      { pos: [0, 14, 0], color: '#ffccff', intensity: 35 },
    ],
    dirLights: [
      { pos: [5, 25, 15], color: '#ffddff', intensity: 6 },
      { pos: [-5, 20, 10], color: '#aa66aa', intensity: 4 },
    ],
    particleType: 'ash', particleColor: '#cc44cc', particleOpacity: 0.4,
    groundColorFn: (v, bm) => [(0.16 + bm * 0.08) * v, (0.06 + bm * 0.03) * v, (0.18 + bm * 0.10) * v],
    wallColors: { slab: ['#5a3058', '#4a2048', '#6a4068', '#7a5078'], box: ['#3a1838', '#4a2848', '#2a0828'], pillar: ['#685068', '#584058', '#786078'] },
    rubbleColors: { rock: ['#4a2848', '#5a3858', '#3a1838'], chunk: ['#5a2040', '#6a3050', '#4a1030'], slab: ['#685068', '#584058', '#786078'], box: ['#3a1838', '#2a0828', '#4a2848'], rebar: ['#884488', '#996699', '#773377'] },
    groundRoughness: 0.85, groundMetalness: 0.1,
  },
}

/* ────────────────────────────
   Debris（單一碎片）
   ──────────────────────────── */

interface DebrisProps extends DebrisItem {} // eslint-disable-line @typescript-eslint/no-empty-object-type

/** 偽噪波 hash */
function hash(x: number, y: number, z: number = 0): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453
  return h - Math.floor(h)
}

function Debris({ position, scale, rotation, color = '#222', type = 'box' }: DebrisProps) {
  const { geometry, material } = useMemo(() => {
    /* eslint-disable react-hooks/purity */
    let geo: THREE.BufferGeometry
    switch (type as DebrisType) {
      case 'slab':
        geo = new THREE.BoxGeometry(1, 1, 1, 6, 4, 6); break
      case 'pillar':
        geo = new THREE.CylinderGeometry(0.3, 0.55, 1, 7, 6); break
      case 'rock':
        geo = new THREE.DodecahedronGeometry(0.5, 2); break
      case 'rebar':
        geo = new THREE.CylinderGeometry(0.06, 0.1, 1, 5, 5); break
      case 'chunk':
        geo = new THREE.TetrahedronGeometry(0.5, 2); break
      default:
        geo = new THREE.BoxGeometry(1, 1, 1, 5, 5, 5)
    }

    const pos = geo.attributes.position as THREE.BufferAttribute
    const normals = geo.attributes.normal as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)
    const baseColor = new THREE.Color(color)
    const strength = type === 'rebar' ? 0.015 : type === 'pillar' ? 0.08 : 0.18

    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i)
      const nx = normals.getX(i), ny = normals.getY(i), nz = normals.getZ(i)
      const noiseVal = (hash(px * 3, py * 3, pz * 3) - 0.5) * 2
      const disp = noiseVal * strength
      const jitter = (Math.random() - 0.5) * strength * 0.3
      pos.setXYZ(
        i,
        px + nx * disp + (Math.random() - 0.5) * strength * 0.15,
        py + ny * disp + jitter,
        pz + nz * disp + (Math.random() - 0.5) * strength * 0.15,
      )

      const coarse = hash(px * 1.5, py * 1.5, pz * 1.5)
      const fine = hash(px * 8, py * 8, pz * 8)
      const v = 0.45 + coarse * 0.35 + fine * 0.2
      const hueShift = (hash(px * 5.3, pz * 5.3, py * 2.1) - 0.5) * 0.08
      colors[i * 3] = Math.min(1, baseColor.r * v + hueShift)
      colors[i * 3 + 1] = Math.min(1, baseColor.g * v - Math.abs(hueShift) * 0.5)
      colors[i * 3 + 2] = Math.min(1, baseColor.b * v)
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()

    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
    })

    return { geometry: geo, material: mat }
  }, [color, type])

  return (
    <mesh
      position={position}
      rotation={rotation}
      scale={scale}
      geometry={geometry}
      material={material}
      castShadow
      receiveShadow
      renderOrder={-1}
    />
  )
}

/* ────────────────────────────
   降落粒子（雨 / 雪 / 飛灰）
   ──────────────────────────── */

interface ParticlesProps {
  type: 'rain' | 'snow' | 'ash'
  count?: number
  area?: number
  height?: number
  speed?: number
  color?: string
  opacity?: number
}

function FallingParticles({
  type,
  count = 1200,
  area = 30,
  height = 15,
  speed: baseSpeed = 14,
  color = '#99aabb',
  opacity = 0.35,
}: ParticlesProps) {
  const meshRef = useRef<THREE.LineSegments | THREE.Points>(null)
  const isRain = type === 'rain'
  const isSnow = type === 'snow'
  // ash = slower, drifting embers

  const speed = isSnow ? baseSpeed * 0.2 : type === 'ash' ? baseSpeed * 0.3 : baseSpeed
  const streakLen = isRain ? 0.6 : 0
  const windX = isRain ? 4 : isSnow ? 1.5 : 2
  const windZ = isRain ? -1.5 : isSnow ? 0.8 : -0.5

  const { positions, velocities } = useMemo(() => {
    /* eslint-disable react-hooks/purity */
    const ptCount = isRain ? count * 2 : count
    const pos = new Float32Array(ptCount * 3)
    const vel = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * area
      const y = Math.random() * height
      const z = (Math.random() - 0.5) * area
      vel[i] = 0.6 + Math.random() * 0.6

      if (isRain) {
        const bi = i * 6
        const dx = (windX / speed) * streakLen
        const dz = (windZ / speed) * streakLen
        pos[bi] = x; pos[bi + 1] = y; pos[bi + 2] = z
        pos[bi + 3] = x + dx; pos[bi + 4] = y - streakLen; pos[bi + 5] = z + dz
      } else {
        const bi = i * 3
        pos[bi] = x; pos[bi + 1] = y; pos[bi + 2] = z
      }
    }
    return { positions: pos, velocities: vel }
  }, [count, area, height, speed, isRain, streakLen, windX, windZ])

  useFrame((_state, delta) => {
    if (!meshRef.current) return
    const pos = (meshRef.current.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array
    const dy = speed * delta
    const dx = windX * delta
    const dz = windZ * delta

    for (let i = 0; i < count; i++) {
      if (isRain) {
        const bi = i * 6
        pos[bi] += dx; pos[bi + 1] -= dy * velocities[i]; pos[bi + 2] += dz
        pos[bi + 3] += dx; pos[bi + 4] -= dy * velocities[i]; pos[bi + 5] += dz
        if (pos[bi + 1] < -0.5) {
          const nx = (Math.random() - 0.5) * area
          const ny = height + Math.random() * 3
          const nz = (Math.random() - 0.5) * area
          const sdx = (windX / speed) * streakLen
          const sdz = (windZ / speed) * streakLen
          pos[bi] = nx; pos[bi + 1] = ny; pos[bi + 2] = nz
          pos[bi + 3] = nx + sdx; pos[bi + 4] = ny - streakLen; pos[bi + 5] = nz + sdz
        }
      } else {
        const bi = i * 3
        // Snow/ash: gentle sway
        const sway = Math.sin(Date.now() * 0.001 + i) * 0.3
        pos[bi] += (dx + sway * delta) * velocities[i]
        pos[bi + 1] -= dy * velocities[i]
        pos[bi + 2] += dz * velocities[i]
        if (pos[bi + 1] < -0.5) {
          pos[bi] = (Math.random() - 0.5) * area
          pos[bi + 1] = height + Math.random() * 3
          pos[bi + 2] = (Math.random() - 0.5) * area
        }
      }
    }
    ;(meshRef.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true
  })

  if (isRain) {
    const mat = new THREE.LineBasicMaterial({
      color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
    })
    return (
      <lineSegments ref={meshRef as React.RefObject<THREE.LineSegments>} material={mat}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} count={count * 2} />
        </bufferGeometry>
      </lineSegments>
    )
  }

  // Snow / Ash → Points
  const mat = new THREE.PointsMaterial({
    color,
    size: isSnow ? 0.15 : 0.1,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: type === 'ash' ? THREE.AdditiveBlending : THREE.NormalBlending,
    sizeAttenuation: true,
  })
  return (
    <points ref={meshRef as React.RefObject<THREE.Points>} material={mat}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={count} />
      </bufferGeometry>
    </points>
  )
}

/* ────────────────────────────
   碎片佈局產生
   ──────────────────────────── */

function generateDebris(theme: SceneTheme): DebrisItem[] {
  const items: DebrisItem[] = []
  const wallTypes: DebrisType[] = ['slab', 'box', 'pillar']
  const rubbleTypes: DebrisType[] = ['rock', 'chunk', 'slab', 'box', 'rebar']

  while (items.length < 80) {
    const x = (Math.random() - 0.5) * 35
    const z = (Math.random() - 0.5) * 35
    if (Math.abs(x) < 6 && z > -16 && z < 16) continue

    const isWall = items.length < 12
    const typePool = isWall ? wallTypes : rubbleTypes
    const type = typePool[Math.floor(Math.random() * typePool.length)]

    const colorPool = isWall
      ? (theme.wallColors[type] || ['#888'])
      : (theme.rubbleColors[type] || ['#555'])
    const chosenColor = colorPool[Math.floor(Math.random() * colorPool.length)]

    let sx: number, sy: number, sz: number
    if (isWall) {
      if (type === 'pillar') {
        sx = 0.8 + Math.random() * 0.5; sy = Math.random() * 5 + 3; sz = 0.8 + Math.random() * 0.5
      } else {
        sx = Math.random() * 3 + 1; sy = Math.random() * 6 + 2; sz = 0.3 + Math.random() * 0.5
      }
    } else if (type === 'rebar') {
      sx = 1; sy = Math.random() * 2 + 1; sz = 1
    } else {
      sx = Math.random() * 1.5 + 0.3; sy = 0.15 + Math.random() * 0.6; sz = Math.random() * 1.5 + 0.3
    }

    const baseY = isWall ? sy * 0.5 : (type === 'rock' || type === 'chunk' ? sy * 0.25 : sy * 0.5)
    const groundY = isWall ? baseY : baseY * 0.6 - 0.05

    items.push({
      position: [x, groundY, z],
      scale: [sx, sy, sz],
      rotation: [
        (Math.random() - 0.5) * (isWall ? 0.12 : 0.4),
        Math.random() * Math.PI,
        (Math.random() - 0.5) * (isWall ? 0.08 : 0.35),
      ],
      color: chosenColor,
      type,
    })
  }
  return items
}

/* ────────────────────────────
   地面幾何產生
   ──────────────────────────── */

function createGroundGeometry(theme: SceneTheme): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(60, 60, 64, 64)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const colors = new Float32Array(pos.count * 3)

  const hash2 = (x: number, y: number) => {
    const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
    return h - Math.floor(h)
  }

  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i)
    const distX = Math.abs(px), distZ = Math.abs(py)
    const inArena = distX < 12 && distZ < 8
    const edgeFade = inArena ? 0 : Math.min(1, Math.max(distX - 12, distZ - 8, 0) / 5)

    const n1 = (hash2(px * 0.15, py * 0.15) - 0.5) * 0.5
    const n2 = (hash2(px * 0.5, py * 0.5) - 0.5) * 0.18
    const n3 = (hash2(px * 2.0, py * 2.0) - 0.5) * 0.05
    pos.setZ(i, (n1 + n2 + n3) * edgeFade)

    const coarse = hash2(px * 0.2, py * 0.2)
    const fine = hash2(px * 1.5, py * 1.5)
    const detail = hash2(px * 5, py * 5)
    const v = 0.35 + coarse * 0.25 + fine * 0.12 + detail * 0.05
    const brownMix = hash2(px * 0.3 + 100, py * 0.3 + 100)
    const [r, g, b] = theme.groundColorFn(v, brownMix)
    const stain = hash2(px * 0.8 + 50, py * 0.8 + 50) < 0.2 ? 0.5 : 1.0
    colors[i * 3] = Math.min(1, r * stain)
    colors[i * 3 + 1] = Math.min(1, g * stain)
    colors[i * 3 + 2] = Math.min(1, b * stain)
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  return geo
}

/* ────────────────────────────
   Arena（場景主元件）
   ──────────────────────────── */

interface ArenaProps {
  sceneMode?: SceneMode
  stageId?: string
}

export function Arena({ sceneMode = 'story', stageId = '1-1' }: ArenaProps) {
  const theme = THEMES[sceneMode]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debris = useMemo(() => generateDebris(theme), [sceneMode])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const groundGeo = useMemo(() => createGroundGeometry(theme), [sceneMode])

  return (
    <>
      <Sky
        distance={450000}
        sunPosition={[0, theme.skyConfig.sunY, 0]}
        inclination={0}
        azimuth={1.25}
        rayleigh={theme.skyConfig.rayleigh}
        turbidity={theme.skyConfig.turbidity}
      />
      <Sparkles
        count={theme.sparkleCount}
        scale={20}
        size={1.5}
        speed={0.4}
        opacity={0.3}
        color={theme.sparkleColor}
      />
      <FallingParticles
        type={theme.particleType}
        color={theme.particleColor}
        opacity={theme.particleOpacity}
      />
      <fog attach="fog" args={[theme.fogColor, theme.fogNear, theme.fogFar]} />

      {/* 地面 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} geometry={groundGeo} receiveShadow>
        <meshBasicMaterial
          vertexColors
        />
      </mesh>

      {debris.map((d, i) => (
        <Debris key={i} {...d} />
      ))}

      {/* 章節專屬場景道具（每小關不同佈局） */}
      <SceneProps sceneMode={sceneMode} stageId={stageId} />

      {/* 燈光 */}
      <ambientLight intensity={theme.ambientIntensity} />
      <hemisphereLight intensity={theme.hemiIntensity} args={theme.hemiArgs} />

      {theme.pointLights.map((pl, i) => (
        <pointLight key={`pl${i}`} position={pl.pos} intensity={pl.intensity} color={pl.color} distance={40} decay={2} castShadow={false} />
      ))}

      <directionalLight
        position={theme.dirLights[0]?.pos ?? [5, 25, 15]}
        intensity={theme.dirLights[0]?.intensity ?? 5}
        color={theme.dirLights[0]?.color ?? '#ffffff'}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
        shadow-camera-near={0.5}
        shadow-camera-far={50}
      />
      {theme.dirLights[1] && (
        <directionalLight
          position={theme.dirLights[1].pos}
          intensity={theme.dirLights[1].intensity}
          color={theme.dirLights[1].color}
          castShadow={false}
        />
      )}
    </>
  )
}
