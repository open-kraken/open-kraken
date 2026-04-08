import { useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  User,
  Mail,
  Shield,
  Key,
  Bell,
  Zap,
  Clock,
  Globe,
  Save,
  Camera,
  Check,
  AlertCircle,
} from 'lucide-react';
import { PixelAvatar } from '@/components/ui/pixel-avatar';

export const AccountPage = () => {
  const { account } = useAuth();
  const [saved, setSaved] = useState(false);

  const [profileData, setProfileData] = useState({
    name: account?.displayName ?? 'Alex',
    email: 'alex@openkreken.io',
    role: account?.role ?? 'owner',
    timezone: 'UTC+8 Beijing',
    language: 'English',
  });

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="h-full overflow-auto app-bg-canvas">
      <div className="p-6 max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold app-text-strong mb-1">Account Settings</h1>
          <p className="text-sm app-text-muted">Manage your profile and preferences</p>
        </div>

        {/* Profile Card */}
        <Card className="p-6 mb-6">
          <div className="flex items-start gap-6">
            <div className="relative">
              <PixelAvatar name={profileData.name} size="xl" />
              <button className="absolute bottom-0 right-0 w-8 h-8 rounded-full app-accent-bg text-white flex items-center justify-center hover:opacity-90 transition-opacity">
                <Camera size={14} />
              </button>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-2xl font-bold app-text-strong">{profileData.name}</h2>
                <Badge variant="outline" className="app-accent-text border-[#3ecfae]">
                  {profileData.role}
                </Badge>
                {profileData.role === 'owner' && (
                  <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                    <Shield size={12} className="mr-1" />
                    Admin
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm app-text-muted mb-4">
                <span className="flex items-center gap-1.5">
                  <Mail size={14} />
                  {profileData.email}
                </span>
                <span>&bull;</span>
                <span className="flex items-center gap-1.5">
                  <Globe size={14} />
                  {profileData.timezone}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-xs app-text-faint">
                  <span className="font-semibold app-text-strong">Member since:</span> Jan 2025
                </div>
                <span className="app-text-faint">&bull;</span>
                <div className="text-xs app-text-faint">
                  <span className="font-semibold app-text-strong">Last login:</span> 5 mins ago
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Settings Tabs */}
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="app-surface-strong border app-border-subtle">
            <TabsTrigger value="profile">
              <User size={14} className="mr-2" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="security">
              <Shield size={14} className="mr-2" />
              Security
            </TabsTrigger>
            <TabsTrigger value="notifications">
              <Bell size={14} className="mr-2" />
              Notifications
            </TabsTrigger>
            <TabsTrigger value="api">
              <Key size={14} className="mr-2" />
              API Keys
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile">
            <Card className="p-6">
              <h3 className="font-semibold app-text-strong mb-4">Personal Information</h3>
              <div className="space-y-4 max-w-2xl">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name" className="text-sm font-medium app-text-strong mb-2">
                      Display Name
                    </Label>
                    <Input
                      id="name"
                      value={profileData.name}
                      onChange={(e) =>
                        setProfileData({ ...profileData, name: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="email" className="text-sm font-medium app-text-strong mb-2">
                      Email Address
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={profileData.email}
                      onChange={(e) =>
                        setProfileData({ ...profileData, email: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label
                      htmlFor="timezone"
                      className="text-sm font-medium app-text-strong mb-2"
                    >
                      Timezone
                    </Label>
                    <Input
                      id="timezone"
                      value={profileData.timezone}
                      onChange={(e) =>
                        setProfileData({ ...profileData, timezone: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label
                      htmlFor="language"
                      className="text-sm font-medium app-text-strong mb-2"
                    >
                      Language
                    </Label>
                    <Input
                      id="language"
                      value={profileData.language}
                      onChange={(e) =>
                        setProfileData({ ...profileData, language: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-4">
                  <Button
                    onClick={handleSave}
                    className="app-accent-bg hover:opacity-90 text-white"
                  >
                    <Save size={14} className="mr-2" />
                    Save Changes
                  </Button>
                  {saved && (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <Check size={16} />
                      <span>Saved successfully!</span>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security">
            <div className="space-y-4">
              <Card className="p-6">
                <h3 className="font-semibold app-text-strong mb-4">
                  Password & Authentication
                </h3>
                <div className="space-y-4 max-w-2xl">
                  <div>
                    <Label
                      htmlFor="current-password"
                      className="text-sm font-medium app-text-strong mb-2"
                    >
                      Current Password
                    </Label>
                    <Input
                      id="current-password"
                      type="password"
                      placeholder="Enter current password"
                    />
                  </div>
                  <div>
                    <Label
                      htmlFor="new-password"
                      className="text-sm font-medium app-text-strong mb-2"
                    >
                      New Password
                    </Label>
                    <Input
                      id="new-password"
                      type="password"
                      placeholder="Enter new password"
                    />
                  </div>
                  <div>
                    <Label
                      htmlFor="confirm-password"
                      className="text-sm font-medium app-text-strong mb-2"
                    >
                      Confirm Password
                    </Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      placeholder="Confirm new password"
                    />
                  </div>
                  <Button className="app-accent-bg hover:opacity-90 text-white">
                    <Key size={14} className="mr-2" />
                    Update Password
                  </Button>
                </div>
              </Card>

              <Card className="p-6">
                <h3 className="font-semibold app-text-strong mb-4">
                  Two-Factor Authentication
                </h3>
                <div className="flex items-start gap-4 p-4 app-surface-strong rounded-lg border app-border-subtle">
                  <div className="flex-1">
                    <div className="font-medium app-text-strong mb-1">Enable 2FA</div>
                    <div className="text-sm app-text-muted">
                      Add an extra layer of security to your account
                    </div>
                  </div>
                  <Button variant="outline">Configure</Button>
                </div>
              </Card>

              <Card className="p-6">
                <h3 className="font-semibold app-text-strong mb-4">Active Sessions</h3>
                <div className="space-y-3">
                  {[
                    {
                      device: 'MacBook Pro',
                      location: 'Beijing, China',
                      time: 'Active now',
                      current: true,
                    },
                    {
                      device: 'iPhone 15',
                      location: 'Beijing, China',
                      time: '2 hours ago',
                      current: false,
                    },
                  ].map((session, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-4 app-surface-strong rounded-lg border app-border-subtle"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                          <Zap size={18} className="text-white" />
                        </div>
                        <div>
                          <div className="font-medium app-text-strong text-sm flex items-center gap-2">
                            {session.device}
                            {session.current && (
                              <Badge
                                variant="outline"
                                className="text-green-600 border-green-600 text-xs"
                              >
                                Current
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs app-text-muted flex items-center gap-2">
                            <Globe size={12} />
                            {session.location}
                            <span>&bull;</span>
                            <Clock size={12} />
                            {session.time}
                          </div>
                        </div>
                      </div>
                      {!session.current && (
                        <Button variant="outline" size="sm">
                          Revoke
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications">
            <Card className="p-6">
              <h3 className="font-semibold app-text-strong mb-4">Notification Preferences</h3>
              <div className="space-y-4 max-w-2xl">
                {[
                  {
                    title: 'Task Approvals',
                    description: 'Get notified when tasks require your approval',
                    enabled: true,
                  },
                  {
                    title: 'Agent Activity',
                    description: 'Receive updates on agent task completion and failures',
                    enabled: true,
                  },
                  {
                    title: 'System Alerts',
                    description: 'Critical alerts about node health and cluster status',
                    enabled: true,
                  },
                  {
                    title: 'Team Updates',
                    description: 'Updates from team members and collaborators',
                    enabled: false,
                  },
                  {
                    title: 'Weekly Reports',
                    description: 'Weekly summary of platform activity and costs',
                    enabled: true,
                  },
                ].map((notif, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-4 app-surface-strong rounded-lg border app-border-subtle"
                  >
                    <div className="flex-1">
                      <div className="font-medium app-text-strong mb-1">{notif.title}</div>
                      <div className="text-sm app-text-muted">{notif.description}</div>
                    </div>
                    <Button variant={notif.enabled ? 'default' : 'outline'} size="sm">
                      {notif.enabled ? 'Enabled' : 'Disabled'}
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          {/* API Keys Tab */}
          <TabsContent value="api">
            <div className="space-y-4">
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold app-text-strong">API Keys</h3>
                  <Button className="app-accent-bg hover:opacity-90 text-white">
                    <Key size={14} className="mr-2" />
                    Create New Key
                  </Button>
                </div>
                <div className="space-y-3">
                  {[
                    {
                      name: 'Production API Key',
                      key: 'kraken_prod_..............6f2a',
                      created: '2025-01-15',
                      lastUsed: '2 mins ago',
                      active: true,
                    },
                    {
                      name: 'Staging API Key',
                      key: 'kraken_stag_..............9c3b',
                      created: '2025-01-10',
                      lastUsed: '3 hours ago',
                      active: true,
                    },
                    {
                      name: 'Development Key',
                      key: 'kraken_dev_..............4a1d',
                      created: '2024-12-20',
                      lastUsed: 'Never',
                      active: false,
                    },
                  ].map((apiKey, i) => (
                    <div
                      key={i}
                      className="p-4 app-surface-strong rounded-lg border app-border-subtle"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="font-medium app-text-strong text-sm flex items-center gap-2 mb-1">
                            {apiKey.name}
                            {apiKey.active ? (
                              <Badge
                                variant="outline"
                                className="text-green-600 border-green-600 text-xs"
                              >
                                Active
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-gray-500 border-gray-500 text-xs"
                              >
                                Inactive
                              </Badge>
                            )}
                          </div>
                          <div className="font-mono text-xs app-text-muted">{apiKey.key}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm">
                            Copy
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-600"
                          >
                            Revoke
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs app-text-faint">
                        <span>Created: {apiKey.created}</span>
                        <span>&bull;</span>
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          Last used: {apiKey.lastUsed}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-4 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800">
                <div className="flex items-start gap-3">
                  <AlertCircle size={16} className="text-orange-600 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-medium text-sm text-orange-900 dark:text-orange-200 mb-1">
                      Keep your API keys secure
                    </div>
                    <div className="text-xs text-orange-800 dark:text-orange-300">
                      Never share your API keys or commit them to version control. Revoke any
                      compromised keys immediately.
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
