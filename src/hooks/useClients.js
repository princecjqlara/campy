import { useStorage } from './useStorage';

export const useClients = () => {
  const storage = useStorage();

  return {
    clients: storage.clients,
    getClient: storage.getClient,
    addClient: storage.addClient,
    updateClient: storage.updateClient,
    deleteClient: storage.deleteClient
  };
};

