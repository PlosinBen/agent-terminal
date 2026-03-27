import { createContext, useContext, useRef } from 'react';
import { AgentService } from './agent-service';

const ServiceContext = createContext<AgentService | null>(null);

export function ServiceProvider({ children }: { children: React.ReactNode }) {
  const serviceRef = useRef<AgentService | null>(null);
  if (!serviceRef.current) {
    serviceRef.current = new AgentService();
  }

  return (
    <ServiceContext.Provider value={serviceRef.current}>
      {children}
    </ServiceContext.Provider>
  );
}

export function useService(): AgentService {
  const service = useContext(ServiceContext);
  if (!service) throw new Error('useService must be used within ServiceProvider');
  return service;
}
