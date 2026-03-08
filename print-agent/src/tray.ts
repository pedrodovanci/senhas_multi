import SysTray from 'systray2';

interface Tray {
  setStatus: (status: 'connected' | 'disconnected') => void;
  kill: () => void;
}

export const createTrayIcon = (): Tray => {
  const item = {
    title: 'Agente de Impressão CCC',
    tooltip: 'CCC Print Agent',
    checked: false,
    enabled: true
  };

  const systray = new SysTray({
    menu: {
      icon: '', // Base64 icon could be added here
      title: 'CCC Print Agent',
      tooltip: 'CCC Print Agent',
      items: [
        item,
        {
          title: 'Sair',
          tooltip: 'Fechar Agente',
          checked: false,
          enabled: true
        }
      ]
    },
    debug: false,
    copyDir: true // copy helper binaries to tmp
  });

  systray.onClick((action: any) => {
    if (action.item.title === 'Sair') {
      systray.kill();
      process.exit(0);
    }
  });

  return {
    setStatus: (status: 'connected' | 'disconnected') => {
      // In a real implementation we would swap icons
      // For now we just log or update title if possible
      console.log(`[Tray] Status changed to: ${status}`);
    },
    kill: () => systray.kill()
  };
};
