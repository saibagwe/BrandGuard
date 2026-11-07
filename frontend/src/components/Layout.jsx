import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  LayoutDashboard,
  FilePlus,
  ClipboardCheck,
  BookOpen,
  ScrollText,
  LogOut,
  ShieldCheck,
} from 'lucide-react'

const ROLE_COLORS = {
  reviewer: 'bg-purple-100 text-purple-700',
  creator: 'bg-blue-100 text-blue-700',
}

const CREATOR_NAV = [
  { to: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/submit', label: 'Submit Content', Icon: FilePlus },
]

const REVIEWER_NAV = [
  { to: '/approvals', label: 'Review Queue', Icon: ClipboardCheck },
  { to: '/guidelines', label: 'Guidelines', Icon: BookOpen },
  { to: '/audit', label: 'Audit Log', Icon: ScrollText },
]

function NavItem({ to, label, Icon }) {
  return (
    <NavLink
      key={label}
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-brand-blue text-white'
            : 'text-blue-200 hover:bg-blue-900 hover:text-white'
        }`
      }
    >
      <Icon size={18} />
      {label}
    </NavLink>
  )
}

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const isReviewer = user?.role === 'reviewer'
  const navItems = isReviewer ? REVIEWER_NAV : CREATOR_NAV
  const homeLink = isReviewer ? '/approvals' : '/dashboard'
  const workspaceLabel = isReviewer ? 'Reviewer Workspace' : 'Creator Workspace'

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside className="flex flex-col w-64 bg-brand-navy text-white shrink-0">
        {/* Logo */}
        <NavLink to={homeLink} className="p-5 border-b border-blue-900 flex items-center gap-3 hover:bg-blue-900 transition-colors">
          <div className="w-10 h-10 rounded-lg bg-brand-blue flex items-center justify-center font-bold text-lg shrink-0">
            <ShieldCheck size={22} />
          </div>
          <div>
            <div className="font-bold text-sm leading-tight">BrandGuard AI</div>
            <div className="text-xs text-blue-300 leading-tight">{workspaceLabel}</div>
          </div>
        </NavLink>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navItems.map(({ to, label, Icon }) => (
            <NavItem key={label} to={to} label={label} Icon={Icon} />
          ))}
        </nav>

        {/* User info & logout */}
        <div className="p-4 border-t border-blue-900">
          <div className="mb-3">
            <div className="text-sm font-medium truncate">{user?.full_name || user?.email}</div>
            <div className="text-xs text-blue-300 truncate">{user?.email}</div>
            <span
              className={`mt-1 inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${
                ROLE_COLORS[user?.role] || 'bg-gray-200 text-gray-700'
              }`}
            >
              {user?.role}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-blue-300 hover:text-white transition-colors w-full"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="min-h-full">{children}</div>
      </main>
    </div>
  )
}
