"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Crosshair,
  Settings,
  Activity,
  RefreshCw,
  ExternalLink,
  MessageCircle,
  Filter,
  Search,
  Zap,
  Shield,
  Eye,
  EyeOff,
  Trash2,
  Plus,
  X,
  Loader2,
  Clock,
  TrendingUp,
  Home,
  Bell,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";

// ─── Types ────────────────────────────────────────────────────

interface Listing {
  id: string;
  title: string;
  price: number;
  url: string;
  source: string;
  phone: string | null;
  agentScore: number;
  sourceListedAt: string | null;
  createdAt: string;
  status: string;
  leadLatency: number | null;
}

interface AdminSettings {
  id: string;
  blacklistKeywords: string[];
  scrapeInterval: number;
  notifyMode: string;
  agentThreshold: number;
}

interface HunterStatus {
  status: string;
  service: string;
  version: string;
  database: { totalListings: number; newListings: number; sentListings: number };
  config: {
    scrapeIntervalMin: number;
    notifyMode: string;
    agentThreshold: number;
    telegramConfigured: boolean;
  };
  lastCycle: {
    cycleNumber: number;
    totalScraped: number;
    newListings: number;
    jitterDelayMs: number;
    latencyMs: number;
    ranAt: string;
  } | null;
  nextCycle: string | null;
  uptime: { totalCycles: number; totalNewListings: number };
}

// ─── Helpers ──────────────────────────────────────────────────

function getAgentScoreColor(score: number): string {
  if (score <= 30) return "text-green-400";
  if (score <= 60) return "text-yellow-400";
  return "text-red-400";
}

function getAgentScoreBg(score: number): string {
  if (score <= 30) return "bg-green-500/10 text-green-400 border-green-500/20";
  if (score <= 60) return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
  return "bg-red-500/10 text-red-400 border-red-500/20";
}

function getAgentScoreEmoji(score: number): string {
  if (score <= 30) return "🟢";
  if (score <= 60) return "🟡";
  return "🔴";
}

function getAgentScoreLabel(score: number): string {
  if (score <= 30) return "Likely Owner";
  if (score <= 60) return "Uncertain";
  return "Likely Agent";
}

function getStatusBadge(status: string) {
  switch (status) {
    case "NEW":
      return (
        <Badge className="bg-lime-500/15 text-lime-400 border-lime-500/30 hover:bg-lime-500/25">
          New
        </Badge>
      );
    case "SENT":
      return (
        <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 hover:bg-blue-500/25">
          Sent
        </Badge>
      );
    case "IGNORED":
      return (
        <Badge className="bg-gray-500/15 text-gray-400 border-gray-500/30 hover:bg-gray-500/25">
          Ignored
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function formatPrice(price: number): string {
  return `AED ${price.toLocaleString()}`;
}

function formatLatency(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${min}m ${sec}s`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── Main Dashboard ───────────────────────────────────────────

type Tab = "leads" | "control" | "hunter";

export default function LykosaDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("leads");
  const [listings, setListings] = useState<Listing[]>([]);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [hunterStatus, setHunterStatus] = useState<HunterStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [scoreRange, setScoreRange] = useState<[number, number]>([0, 100]);

  // Control center state
  const [newKeyword, setNewKeyword] = useState("");

  // Fetch all data
  const fetchData = useCallback(async () => {
    try {
      const [listingsRes, settingsRes, hunterRes] = await Promise.allSettled([
        fetch(
          `/api/listings?status=${statusFilter === "all" ? "" : statusFilter}&search=${searchQuery}&agentScoreMin=${scoreRange[0]}&agentScoreMax=${scoreRange[1]}&limit=100&sortBy=createdAt&sortOrder=desc`
        ),
        fetch("/api/admin-settings"),
        fetch("/api/hunter"),
      ]);

      if (listingsRes.status === "fulfilled" && listingsRes.value.ok) {
        const data = await listingsRes.value.json();
        setListings(data.listings || []);
      }

      if (settingsRes.status === "fulfilled" && settingsRes.value.ok) {
        const data = await settingsRes.value.json();
        setSettings(data.settings);
      }

      if (hunterRes.status === "fulfilled" && hunterRes.value.ok) {
        const data = await hunterRes.value.json();
        setHunterStatus(data);
      }
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery, scoreRange]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  // Update listing status
  const updateListingStatus = async (id: string, status: string) => {
    await fetch(`/api/listings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchData();
  };

  // Update admin settings
  const updateSettings = async (updates: Partial<AdminSettings>) => {
    await fetch("/api/admin-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    fetchData();
  };

  // ─── Stats ────────────────────────────────────────────────

  const totalListings = hunterStatus?.database?.totalListings ?? listings.length;
  const newListings = listings.filter((l) => l.status === "NEW").length;
  const ownerLikely = listings.filter((l) => l.agentScore <= 30).length;
  const agentLikely = listings.filter((l) => l.agentScore > 60).length;

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border/50 backdrop-blur-xl bg-background/80 sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-lime-400 flex items-center justify-center">
              <Crosshair className="h-5 w-5 text-slate-950" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">
                Lykosa
              </h1>
              <p className="text-[10px] text-muted-foreground -mt-0.5 tracking-widest uppercase">
                Lead Hunter
              </p>
            </div>
          </div>

          {/* Nav Tabs */}
          <nav className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg">
            {[
              { id: "leads" as Tab, icon: Home, label: "Leads" },
              { id: "control" as Tab, icon: Settings, label: "Control" },
              { id: "hunter" as Tab, icon: Activity, label: "Hunter" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? "bg-lime-400 text-slate-950 shadow-lg shadow-lime-400/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <tab.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {hunterStatus?.status === "running" && (
              <Badge className="bg-green-500/15 text-green-400 border-green-500/30">
                <span className="mr-1.5 h-2 w-2 rounded-full bg-green-400 animate-pulse inline-block" />
                Hunter Live
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchData}
              className="text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-[1600px] mx-auto w-full px-4 sm:px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-lime-400" />
          </div>
        ) : (
          <>
            {/* Stats Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card className="bg-card/60 backdrop-blur border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-lime-400/10 flex items-center justify-center">
                      <TrendingUp className="h-5 w-5 text-lime-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">
                        {totalListings}
                      </p>
                      <p className="text-xs text-muted-foreground">Total Leads</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/60 backdrop-blur border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-blue-400/10 flex items-center justify-center">
                      <Zap className="h-5 w-5 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">
                        {newListings}
                      </p>
                      <p className="text-xs text-muted-foreground">New Leads</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/60 backdrop-blur border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-green-400/10 flex items-center justify-center">
                      <Shield className="h-5 w-5 text-green-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">
                        {ownerLikely}
                      </p>
                      <p className="text-xs text-muted-foreground">Likely Owner</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/60 backdrop-blur border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-red-400/10 flex items-center justify-center">
                      <Bell className="h-5 w-5 text-red-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">
                        {agentLikely}
                      </p>
                      <p className="text-xs text-muted-foreground">Likely Agent</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Tab Content */}
            {activeTab === "leads" && (
              <LeadsTab
                listings={listings}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                scoreRange={scoreRange}
                setScoreRange={setScoreRange}
                updateListingStatus={updateListingStatus}
              />
            )}
            {activeTab === "control" && (
              <ControlTab
                settings={settings}
                updateSettings={updateSettings}
                newKeyword={newKeyword}
                setNewKeyword={setNewKeyword}
              />
            )}
            {activeTab === "hunter" && (
              <HunterTab status={hunterStatus} />
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-border/50 bg-background/80 backdrop-blur">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>Lykosa v2.0 — AI-Powered Lead Hunter</span>
          <span>
            {hunterStatus?.status === "running"
              ? `🟢 Hunter Active — Cycle #${hunterStatus.uptime?.totalCycles ?? 0}`
              : "⚫ Hunter Offline"}
          </span>
        </div>
      </footer>
    </div>
  );
}

// ─── Leads Tab ────────────────────────────────────────────────

function LeadsTab({
  listings,
  statusFilter,
  setStatusFilter,
  searchQuery,
  setSearchQuery,
  scoreRange,
  setScoreRange,
  updateListingStatus,
}: {
  listings: Listing[];
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  scoreRange: [number, number];
  setScoreRange: (v: [number, number]) => void;
  updateListingStatus: (id: string, status: string) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="bg-card/60 backdrop-blur border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="h-4 w-4" />
              Filters
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] h-9 bg-muted/50 border-border/50">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="NEW">New</SelectItem>
                <SelectItem value="SENT">Sent</SelectItem>
                <SelectItem value="IGNORED">Ignored</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search listings…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 bg-muted/50 border-border/50"
              />
            </div>

            <div className="flex items-center gap-2 min-w-[220px]">
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                Score: {scoreRange[0]}–{scoreRange[1]}
              </span>
              <Slider
                value={scoreRange}
                onValueChange={(v) => setScoreRange(v as [number, number])}
                min={0}
                max={100}
                step={5}
                className="flex-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-card/60 backdrop-blur border-border/50">
        <CardContent className="p-0">
          <ScrollArea className="max-h-[calc(100vh-380px)]">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="w-[40%]">Listing</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Agent Score</TableHead>
                  <TableHead>Latency</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Detected</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      No listings found. Hunter will populate leads automatically.
                    </TableCell>
                  </TableRow>
                ) : (
                  listings.map((listing) => (
                    <TableRow
                      key={listing.id}
                      className="border-border/30 hover:bg-muted/30 transition-colors"
                    >
                      <TableCell>
                        <div className="space-y-1">
                          <a
                            href={listing.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-foreground hover:text-lime-400 transition-colors line-clamp-1"
                          >
                            {listing.title}
                          </a>
                          <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                            {listing.url}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {listing.price > 0 ? formatPrice(listing.price) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`${getAgentScoreBg(listing.agentScore)} text-xs`}
                        >
                          {getAgentScoreEmoji(listing.agentScore)}{" "}
                          {listing.agentScore}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {listing.leadLatency !== null ? (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatLatency(listing.leadLatency)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(listing.status)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {timeAgo(listing.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {listing.phone && (
                            <a
                              href={`https://wa.me/${listing.phone.replace(/[^0-9]/g, "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center h-8 w-8 rounded-md text-green-400 hover:bg-green-400/10 transition-colors"
                              title="WhatsApp"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </a>
                          )}
                          <a
                            href={listing.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            title="Open listing"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                          {listing.status !== "IGNORED" && (
                            <button
                              onClick={() => updateListingStatus(listing.id, "IGNORED")}
                              className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-red-400/10 hover:text-red-400 transition-colors"
                              title="Ignore"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Control Tab ──────────────────────────────────────────────

function ControlTab({
  settings,
  updateSettings,
  newKeyword,
  setNewKeyword,
}: {
  settings: AdminSettings | null;
  updateSettings: (updates: Partial<AdminSettings>) => void;
  newKeyword: string;
  setNewKeyword: (v: string) => void;
}) {
  if (!settings) {
    return (
      <Card className="bg-card/60 backdrop-blur border-border/50">
        <CardContent className="p-8 text-center text-muted-foreground">
          Loading settings…
        </CardContent>
      </Card>
    );
  }

  const addKeyword = () => {
    if (!newKeyword.trim()) return;
    const updated = [...settings.blacklistKeywords, newKeyword.trim().toLowerCase()];
    updateSettings({ blacklistKeywords: updated });
    setNewKeyword("");
  };

  const removeKeyword = (kw: string) => {
    const updated = settings.blacklistKeywords.filter((k) => k !== kw);
    updateSettings({ blacklistKeywords: updated });
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Keyword Blacklist */}
      <Card className="bg-card/60 backdrop-blur border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-lime-400" />
            Keyword Blacklist
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Listings containing these keywords get +30 agent score
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Add keyword (e.g. broker)"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addKeyword()}
              className="h-9 bg-muted/50 border-border/50"
            />
            <Button
              onClick={addKeyword}
              size="sm"
              className="bg-lime-400 text-slate-950 hover:bg-lime-300 h-9"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
            {settings.blacklistKeywords.map((kw) => (
              <Badge
                key={kw}
                variant="outline"
                className="bg-red-500/10 text-red-400 border-red-500/20 flex items-center gap-1.5 py-1"
              >
                {kw}
                <button
                  onClick={() => removeKeyword(kw)}
                  className="hover:text-white transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {settings.blacklistKeywords.length === 0 && (
              <p className="text-xs text-muted-foreground">No keywords yet</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Scrape Configuration */}
      <Card className="bg-card/60 backdrop-blur border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-lime-400" />
            Scrape Configuration
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Hunter cycle interval and jitter settings
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-muted-foreground">Scrape Interval</label>
              <span className="text-sm font-medium text-foreground">
                {settings.scrapeInterval} min
              </span>
            </div>
            <Slider
              value={[settings.scrapeInterval]}
              onValueChange={([v]) => updateSettings({ scrapeInterval: v })}
              min={1}
              max={60}
              step={1}
            />
            <p className="text-xs text-muted-foreground">
              Base interval + ±15–45s jitter for anti-detection
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Notification Mode */}
      <Card className="bg-card/60 backdrop-blur border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4 text-lime-400" />
            Shadow Mode
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Control which leads trigger Telegram notifications
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-3">
              {settings.notifyMode === "ALL" ? (
                <Eye className="h-5 w-5 text-lime-400" />
              ) : (
                <EyeOff className="h-5 w-5 text-yellow-400" />
              )}
              <div>
                <p className="text-sm font-medium">
                  {settings.notifyMode === "ALL" ? "Notify All" : "Verified Only"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {settings.notifyMode === "ALL"
                    ? "All leads → Telegram"
                    : "Only low-score leads → Telegram"}
                </p>
              </div>
            </div>
            <Switch
              checked={settings.notifyMode === "VERIFIED_ONLY"}
              onCheckedChange={(checked) =>
                updateSettings({ notifyMode: checked ? "VERIFIED_ONLY" : "ALL" })
              }
            />
          </div>
          <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded-md">
            <strong>Dashboard</strong> = Master Feed (all data) ·{" "}
            <strong>Telegram</strong> = Filtered signal feed
          </div>
        </CardContent>
      </Card>

      {/* Agent Threshold */}
      <Card className="bg-card/60 backdrop-blur border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Crosshair className="h-4 w-4 text-lime-400" />
            Agent Score Threshold
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Leads above this score are classified as &ldquo;Likely Agent&rdquo;
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Threshold</span>
              <span className="text-lg font-bold text-foreground">
                {settings.agentThreshold}
              </span>
            </div>
            <Slider
              value={[settings.agentThreshold]}
              onValueChange={([v]) => updateSettings({ agentThreshold: v })}
              min={0}
              max={100}
              step={5}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="h-3 w-3 rounded-full bg-green-400 inline-block" />
              <span className="text-muted-foreground">0–30: Likely Owner</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="h-3 w-3 rounded-full bg-yellow-400 inline-block" />
              <span className="text-muted-foreground">31–60: Uncertain</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="h-3 w-3 rounded-full bg-red-400 inline-block" />
              <span className="text-muted-foreground">
                61–100: Likely Agent (above threshold)
              </span>
            </div>
          </div>

          <Separator className="bg-border/30" />

          <div className="text-xs text-muted-foreground">
            <strong>Scoring Logic:</strong>
            <ul className="mt-1 space-y-0.5 ml-2">
              <li>+40 → Repeated phone number</li>
              <li>+30 → Blacklist keyword match</li>
              <li>+20 → High-frequency posting</li>
              <li>−30 → Owner-like signals</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Hunter Tab ───────────────────────────────────────────────

function HunterTab({ status }: { status: HunterStatus | null }) {
  if (!status) {
    return (
      <Card className="bg-card/60 backdrop-blur border-border/50">
        <CardContent className="p-8 text-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-lime-400" />
          Loading hunter status…
        </CardContent>
      </Card>
    );
  }

  const isRunning = status.status === "running";

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <Card className="bg-card/60 backdrop-blur border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-lime-400" />
            Hunter Service Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Status</p>
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    isRunning ? "bg-green-400 animate-pulse" : "bg-red-400"
                  }`}
                />
                <span className="text-sm font-medium">
                  {isRunning ? "Running" : "Offline"}
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Version</p>
              <p className="text-sm font-medium">{status.version}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Telegram</p>
              <p className="text-sm font-medium">
                {status.config?.telegramConfigured ? "✅ Configured" : "⚠️ Not Set"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Next Cycle</p>
              <p className="text-sm font-medium">
                {status.nextCycle
                  ? timeAgo(status.nextCycle) === "just now"
                    ? "Now"
                    : `in ${Math.max(0, Math.round((new Date(status.nextCycle).getTime() - Date.now()) / 60_000))}m`
                  : "Pending"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Last Cycle */}
      <Card className="bg-card/60 backdrop-blur border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-lime-400" />
            Last Cycle
          </CardTitle>
        </CardHeader>
        <CardContent>
          {status.lastCycle ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Cycle #</p>
                <p className="text-lg font-bold text-foreground">
                  {status.lastCycle.cycleNumber}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Scraped</p>
                <p className="text-lg font-bold text-foreground">
                  {status.lastCycle.totalScraped}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">New Leads</p>
                <p className="text-lg font-bold text-lime-400">
                  {status.lastCycle.newListings}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Jitter</p>
                <p className="text-lg font-bold text-foreground">
                  {(status.lastCycle.jitterDelayMs / 1_000).toFixed(1)}s
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Duration</p>
                <p className="text-lg font-bold text-foreground">
                  {(status.lastCycle.latencyMs / 1_000).toFixed(1)}s
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No cycle data yet. Waiting for first run…
            </p>
          )}
        </CardContent>
      </Card>

      {/* Uptime Stats */}
      <Card className="bg-card/60 backdrop-blur border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-lime-400" />
            Lifetime Stats
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Total Cycles</p>
              <p className="text-2xl font-bold text-foreground">
                {status.uptime?.totalCycles ?? 0}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Total New Leads</p>
              <p className="text-2xl font-bold text-lime-400">
                {status.uptime?.totalNewListings ?? 0}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">DB Total</p>
              <p className="text-2xl font-bold text-foreground">
                {status.database?.totalListings ?? 0}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Current Config</p>
              <p className="text-sm font-medium">
                {status.config?.scrapeIntervalMin ?? 10}min ·{" "}
                {status.config?.notifyMode ?? "ALL"} · Threshold{" "}
                {status.config?.agentThreshold ?? 60}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
