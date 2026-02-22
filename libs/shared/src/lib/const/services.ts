
import { ServiceName } from '../enum/services';
import { ServiceConfig } from '../type/service';

export const SERVICE_CONFIG: Record<ServiceName, ServiceConfig> = {
  [ServiceName.IAM]: {
    port: 3000,
    host: 'localhost',
    mongodbUri: '',
    name: ServiceName.IAM,
  },
  [ServiceName.CBM]: {
    port: 3001,
    host: 'localhost',
    mongodbUri: '',
    name: ServiceName.CBM,
  },
  [ServiceName.NOTI]: {
    port: 3002,
    host: 'localhost',
    mongodbUri: '',
    name: ServiceName.NOTI,
  },
  [ServiceName.AIWM]: {
    port: 3003,
    host: 'localhost',
    mongodbUri: '',
    name: ServiceName.AIWM,
  },
  [ServiceName.MONA]: {
    port: 3005,
    host: 'localhost',
    mongodbUri: '',
    name: ServiceName.MONA,
  },
};
