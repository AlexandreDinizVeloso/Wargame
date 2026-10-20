import type { PlayerOrder } from '../shared/types';
export function orderName(o: PlayerOrder) {
  switch (o.type) {
    case 'RECRUIT_BATTALION':
      return o.isFleet ? 'Construir frota' : 'Recrutar batalhão';
    case 'MOVE_BATTALION':
      return 'Marchar / navegar';
    case 'ENTRENCH_BATTALION':
      return 'Entrincheirar';
    case 'TRAIN_BATTALION':
      return 'Treinar batalhão';
    case 'MERGE_BATTALIONS':
      return 'Fundir formações';
    case 'SPLIT_BATTALION':
      return 'Dividir formação';
    case 'EMBARK_BATTALION':
      return o.fleetId ? 'Embarcar' : 'Desembarcar';
    case 'BUILD_FORT':
      return 'Construir forte';
    case 'BUILD_PORT':
      return 'Construir porto';
    case 'BUILD_MARKET':
      return 'Construir mercado';
    case 'PACIFY':
      return 'Pacificar';
    case 'CONVERT':
      return 'Converter fé';
    case 'DIPLOMACY':
      return 'Diplomacia';
  }
}
