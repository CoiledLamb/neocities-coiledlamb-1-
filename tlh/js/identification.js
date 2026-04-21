/* ==============================================
   THE LONG HAUL — node identification stages

   Single source of truth: S.nodeStages (object keyed
   by node id, values 0-3).

   Stages:
     0 = unknown          — displayed as '???'
     1 = signal           — unlocked via NPC trust t20
     2 = tier visible     — walked an adjacent edge
     3 = visited          — actually arrived at node

   Starting state (in S init): A and H at 3 (porter's
   anchors), all others at 0.

   setNodeStage is a ratchet — only ever raises stage,
   never lowers it.
   ============================================== */
'use strict';

import { S } from './state.js?v=096-10-18';

export function getNodeStage(id) {
  return (S.nodeStages && typeof S.nodeStages[id] === 'number') ? S.nodeStages[id] : 0;
}

export function setNodeStage(id, stage) {
  if (!S.nodeStages) S.nodeStages = {};
  const cur = getNodeStage(id);
  if (stage > cur) {
    S.nodeStages[id] = stage;
    return true;
  }
  return false;
}

export function markEdgeAdjacent(fromId, toId) {
  let changed = false;
  if (setNodeStage(fromId, 2)) changed = true;
  if (setNodeStage(toId,   2)) changed = true;
  return changed;
}

export function getDisplayLabel(id) {
  const stage = getNodeStage(id);
  if (stage >= 3) {
    const node = S.routeNodes.find(n => n.id === id);
    return node ? node.label : id;
  }
  if (stage >= 2) {
    const settle = S.settlements[id];
    return settle ? settle.tier : '???';
  }
  return '???';
}
