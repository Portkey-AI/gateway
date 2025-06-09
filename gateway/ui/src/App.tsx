import { BrowserRouter as Router, Routes, Route, NavLink as Link } from 'react-router-dom'; // Changed Link to NavLink
import ProvidersPage from './pages/ProvidersPage';
import VirtualKeysPage from './pages/VirtualKeysPage';
import ConfigPage from './pages/ConfigPage';
import ObservabilityPage from './pages/ObservabilityPage';
import HomePage from './pages/HomePage';

function App() {
  return (
    <Router>
      <div className="flex flex-col min-h-screen">
        <nav className="bg-gray-800 text-white p-4">
          <div className="container mx-auto flex justify-between items-center">
            <Link to="/" className="text-xl font-bold">Portkey AI Gateway</Link>
            <div className="space-x-4">
              <Link to="/providers" className={({ isActive }) => isActive ? "text-blue-300 font-semibold" : "hover:text-gray-300"}>Providers</Link>
              <Link to="/virtual-keys" className={({ isActive }) => isActive ? "text-blue-300 font-semibold" : "hover:text-gray-300"}>Virtual Keys</Link>
              <Link to="/config" className={({ isActive }) => isActive ? "text-blue-300 font-semibold" : "hover:text-gray-300"}>Config</Link>
              <Link to="/observability" className={({ isActive }) => isActive ? "text-blue-300 font-semibold" : "hover:text-gray-300"}>Observability</Link>
            </div>
          </div>
        </nav>

        <main className="flex-grow container mx-auto p-6 bg-white">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/providers" element={<ProvidersPage />} />
            <Route path="/virtual-keys" element={<VirtualKeysPage />} />
            <Route path="/config" element={<ConfigPage />} />
            <Route path="/observability" element={<ObservabilityPage />} />
          </Routes>
        </main>

        <footer className="bg-gray-200 text-center p-4 mt-auto container mx-auto">
          Portkey AI Gateway UI &copy; 2024
        </footer>
      </div>
    </Router>
  );
}

export default App;
