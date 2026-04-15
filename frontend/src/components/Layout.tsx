import { type ReactNode, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

interface NavItem {
  name: string
  path: string
  icon: string
}

const navItems: NavItem[] = [
  { name: 'Home', path: '/', icon: 'home' },
  { name: 'Assistant', path: '/chat', icon: 'smart_toy' },
  { name: 'Knowledge Base', path: '/knowledge-base', icon: 'account_tree' },
  { name: 'Settings', path: '/settings', icon: 'settings' },
]

const Layout = ({ children }: { children: ReactNode }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const activeLabel = useMemo(() => {
    const match = navItems.find((item) =>
      item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)
    )
    return match?.name || 'POWERGRID'
  }, [location.pathname])

  const closeMobileMenu = () => setMobileMenuOpen(false)

  return (
    <div className="min-h-screen bg-surface font-body text-on-surface antialiased">
      {mobileMenuOpen && (
        <button
          className="fixed inset-0 z-40 bg-slate-900/40 md:hidden"
          onClick={closeMobileMenu}
          aria-label="Close navigation menu"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-blue-50 p-4 transition-transform duration-300 md:w-64 md:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col space-y-6">
          <div className="flex items-center justify-between px-2">
            <div className="flex flex-col space-y-1">
              <h1 className="font-headline text-2xl font-black uppercase tracking-widest text-blue-900">GridIntel</h1>
              <p className="font-label text-[10px] uppercase tracking-widest text-slate-500">Field Ops v2.4</p>
            </div>
            <button
              className="rounded-lg p-2 text-slate-500 hover:bg-blue-100 md:hidden"
              onClick={closeMobileMenu}
              aria-label="Close navigation"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          <nav className="mt-2 flex-1 space-y-2">
            {navItems.map((item) => {
              const isActive =
                location.pathname === item.path ||
                (item.path !== '/' && location.pathname.startsWith(item.path))

              return (
                <Link
                  key={item.name}
                  to={item.path}
                  onClick={closeMobileMenu}
                  className={`flex items-center rounded-lg px-4 py-3 transition-all duration-200 ${
                    isActive
                      ? 'bg-blue-200 font-semibold text-blue-900'
                      : 'text-slate-600 hover:bg-blue-100 hover:text-blue-800'
                  }`}
                >
                  <span className="material-symbols-outlined mr-3">{item.icon}</span>
                  <span className="font-label text-sm uppercase tracking-tight">{item.name}</span>
                </Link>
              )
            })}
          </nav>

          <button
            onClick={() => {
              navigate('/chat')
              closeMobileMenu()
            }}
            className="flex w-full items-center justify-center rounded-xl bg-primary py-4 font-bold text-on-primary shadow-lg shadow-primary/20 transition-all hover:opacity-90"
          >
            <span className="material-symbols-outlined mr-2">add</span>
            New Analysis
          </button>

          <div className="space-y-2 border-t border-blue-100 pt-5">
            <button
              onClick={() => {
                navigate('/settings')
                closeMobileMenu()
              }}
              className="flex w-full items-center px-4 py-2 font-label text-xs uppercase text-slate-500 transition-colors hover:text-blue-800"
            >
              <span className="material-symbols-outlined mr-3 text-sm">help</span>
              Support
            </button>
            <button
              onClick={() => {
                navigate('/settings')
                closeMobileMenu()
              }}
              className="flex w-full items-center px-4 py-2 font-label text-xs uppercase text-slate-500 transition-colors hover:text-blue-800"
            >
              <span className="material-symbols-outlined mr-3 text-sm">sensors</span>
              System Status
            </button>
          </div>
        </div>
      </aside>

      <div className="md:ml-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between bg-blue-50/90 px-4 backdrop-blur-xl md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              className="rounded-lg p-2 text-slate-600 hover:bg-blue-100 md:hidden"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation"
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
            <div className="hidden max-w-md items-center rounded-full bg-surface-container-high px-4 py-1.5 md:flex md:w-full">
              <span className="material-symbols-outlined mr-2 text-lg text-outline">search</span>
              <input
                className="w-full border-none bg-transparent text-sm placeholder:text-outline/60 focus:ring-0"
                placeholder="Search manuals, status, or asset IDs..."
                type="text"
              />
            </div>
            <div className="md:hidden">
              <p className="font-label text-[10px] uppercase tracking-[0.2em] text-slate-500">POWERGRID</p>
              <p className="truncate text-sm font-semibold text-blue-900">{activeLabel}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2 md:space-x-4">
            <button className="relative rounded-full p-2 text-slate-500 transition-colors hover:bg-blue-100/50">
              <span className="material-symbols-outlined">notifications</span>
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-error"></span>
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="rounded-full p-2 text-slate-500 transition-colors hover:bg-blue-100/50"
            >
              <span className="material-symbols-outlined">settings</span>
            </button>
            <div className="h-8 w-8 overflow-hidden rounded-full bg-primary-container ring-2 ring-blue-100">
              <img
                alt="Field Engineer Profile"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDtk5o2oBTFH6zbGmOmTH67YtzbXxJ4taFuWewLxnwlPamjGpDsVUgiIu-EpcFn0ddoo0IUC0gLzjEbgbMq4Rmqb2JT3aeYR7caJbCBKzPqyXKTqH3tfJjZWnSC3lvnziYTC1aItMq8LmwLgrYORzShtvg-7cUnKL-2gktc-joD3vjQYp4yfG5L5DdhCFcL-mb7vdSiqR8bdOokbfBl71E-OIdUTCPcMMOmyP0mHEi-iaVilsJKyUsI6F5UbNtWOZnetRapA8W26xm3"
              />
            </div>
          </div>
        </header>

        <main>{children}</main>
      </div>
    </div>
  )
}

export default Layout
