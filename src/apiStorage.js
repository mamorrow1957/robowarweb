// API-backed storage — used when the user is logged in.
import { apiFetch } from './auth.js';

export async function getRobotsFromAPI() {
  return apiFetch('/api/robots');
}

export async function saveRobotToAPI(robot) {
  return apiFetch(`/api/robots/${robot.id}`, {
    method: 'PUT',
    body: JSON.stringify(robot),
  });
}

export async function deleteRobotFromAPI(id) {
  return apiFetch(`/api/robots/${id}`, { method: 'DELETE' });
}

export async function setRobotShared(id, shared) {
  return apiFetch(`/api/robots/${id}/share`, { method: shared ? 'POST' : 'DELETE' });
}

export async function getSharedRobot(id) {
  return apiFetch(`/api/robots/shared/${id}`);
}
