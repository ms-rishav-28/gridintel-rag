import { type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

const Layout = ({ children }: { children: ReactNode }) => {
  const location = useLocation()
  const navigate = useNavigate()

  const navItems = [
    { name: 'Home', path: '/', icon: 'home' },
    { name: 'Assistant', path: '/chat', icon: 'smart_toy' },
    { name: 'Knowledge Base', path: '/knowledge-base', icon: 'account_tree' },
    { name: 'Settings', path: '/settings', icon: 'settings' },
  ]

  return (
    <div className="bg-surface font-body text-on-surface antialiased min-h-screen">
      {/* SideNavBar */}
      <aside className="h-screen w-64 fixed left-0 top-0 z-50 bg-blue-50 dark:bg-slate-950 flex flex-col p-4 space-y-6">
        <div className="flex flex-col space-y-1 px-2">
          <h1 className="text-2xl font-black text-blue-900 dark:text-white uppercase tracking-widest font-headline">GridIntel</h1>
          <p className="text-[10px] font-label text-slate-500 uppercase tracking-widest">Field Ops v2.4</p>
        </div>
        <nav className="flex-1 space-y-2 mt-4">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path))
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`flex items-center px-4 py-3 transition-all duration-200 rounded-lg ${
                  isActive
                    ? 'bg-blue-200 dark:bg-blue-900/40 text-blue-900 dark:text-blue-100 font-semibold active:translate-x-1'
                    : 'text-slate-600 dark:text-slate-400 hover:text-blue-800 dark:hover:text-blue-200 hover:bg-blue-100 dark:hover:bg-slate-900'
                }`}
              >
                <span className="material-symbols-outlined mr-3">{item.icon}</span>
                <span className="font-label text-sm uppercase tracking-tight">{item.name}</span>
              </Link>
            )
          })}
        </nav>
        <button
          onClick={() => navigate('/chat')}
          className="w-full py-4 bg-primary text-on-primary font-bold rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 hover:opacity-90 transition-all"
        >
          <span className="material-symbols-outlined mr-2">add</span>
          New Analysis
        </button>
        <div className="pt-6 border-t border-blue-100 dark:border-slate-900 space-y-2">
          <button
            onClick={() => navigate('/settings')}
            className="flex items-center px-4 py-2 text-slate-500 hover:text-blue-800 font-label text-xs uppercase w-full"
          >
            <span className="material-symbols-outlined text-sm mr-3">help</span>
            Support
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="flex items-center px-4 py-2 text-slate-500 hover:text-blue-800 font-label text-xs uppercase w-full"
          >
            <span className="material-symbols-outlined text-sm mr-3">sensors</span>
            System Status
          </button>
        </div>
      </aside>

      {/* Main Content Canvas */}
      <main className="ml-64 min-h-screen">
        {/* TopAppBar */}
        <header className="w-full top-0 sticky z-40 bg-blue-50/80 dark:bg-slate-950/80 backdrop-blur-xl flex items-center justify-between px-8 h-16">
          <div className="flex items-center flex-1">
            <div className="bg-surface-container-high rounded-full px-4 py-1.5 flex items-center w-full max-w-md">
              <span className="material-symbols-outlined text-outline text-lg mr-2">search</span>
              <input
                className="bg-transparent border-none focus:ring-0 text-sm w-full placeholder:text-outline/60"
                placeholder="Search manuals, status, or asset IDs..."
                type="text"
              />
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <button className="p-2 text-slate-500 hover:bg-blue-100/50 transition-colors rounded-full relative">
              <span className="material-symbols-outlined">notifications</span>
              <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full"></span>
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="p-2 text-slate-500 hover:bg-blue-100/50 transition-colors rounded-full"
            >
              <span className="material-symbols-outlined">settings</span>
            </button>
            <div className="h-8 w-8 rounded-full bg-primary-container overflow-hidden ring-2 ring-blue-100">
              <img
                alt="Field Engineer Profile"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDtk5o2oBTFH6zbGmOmTH67YtzbXxJ4taFuWewLxnwlPamjGpDsVUgiIu-EpcFn0ddoo0IUC0gLzjEbgbMq4Rmqb2JT3aeYR7caJbCBKzPqyXKTqH3tfJjZWnSC3lvnziYTC1aItMq8LmwLgrYORzShtvg-7cUnKL-2gktc-joD3vjQYp4yfG5L5DdhCFcL-mb7vdSiqR8bdOokbfBl71E-OIdUTCPcMMOmyP0mHEi-iaVilsJKyUsI6F5UbNtWOZnetRapA8W26xm3"
              />
            </div>
          </div>
        </header>

        {children}

      </main>
    </div>
  )
}

export default Layout
