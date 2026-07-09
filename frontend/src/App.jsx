import { CompanyConsole } from './pages/CompanyConsole.jsx';
import { SuperadminConsole } from './pages/SuperadminConsole.jsx';

export function App() {
  const path = window.location.pathname;

  if (path === '/superadmin') {
    return <SuperadminConsole />;
  }

  return <CompanyConsole />;
}
