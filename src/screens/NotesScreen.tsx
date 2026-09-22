import { useState } from "react";
import {
  FileText,
  Plus,
  Trash2,
  Search,
  Folder as FolderIcon,
  PanelLeft,
  PanelLeftClose,
  LayoutGrid,
  List as ListIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/toast";
import { api, type NoteFile, type NoteFolder, emptyNote } from "@/lib/api";
import { NoteEditor } from "./NoteEditor";

interface NotesScreenProps {
  notes: NoteFile[];
  folders: NoteFolder[];
  selectedFolderId: string | null;
  onSelectFolderFilter: (folderId: string | null) => void;
  onRefresh: () => Promise<void>;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

function stripHtml(html: string): string {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

export function NotesScreen({
  notes,
  folders,
  selectedFolderId,
  onSelectFolderFilter,
  onRefresh,
  sidebarCollapsed,
  onToggleSidebar,
}: NotesScreenProps) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [activeNote, setActiveNote] = useState<NoteFile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NoteFile | null>(null);

  // Filter notes based on search & selected folder
  const filteredNotes = notes.filter((n) => {
    if (selectedFolderId && n.folder_id !== selectedFolderId) {
      return false;
    }
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const text = stripHtml(n.content).toLowerCase();
    return n.title.toLowerCase().includes(q) || text.includes(q);
  });

  const handleCreateNew = () => {
    const fresh = emptyNote(selectedFolderId);
    setActiveNote(fresh);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteNote(deleteTarget.id);
      toast(`Note "${deleteTarget.title}" deleted`, "success");
      setDeleteTarget(null);
      if (activeNote?.id === deleteTarget.id) {
        setActiveNote(null);
      }
      await onRefresh();
    } catch (err) {
      toast(`Failed to delete note: ${err}`, "error");
    }
  };

  // If a note is being edited, render NoteEditor full screen
  if (activeNote) {
    return (
      <NoteEditor
        note={activeNote}
        folders={folders}
        onBack={() => {
          setActiveNote(null);
          onRefresh();
        }}
        onSave={(saved) => {
          setActiveNote(saved);
          onRefresh();
        }}
        onDelete={async (id) => {
          try {
            await api.deleteNote(id);
            toast("Note deleted", "success");
            setActiveNote(null);
            await onRefresh();
          } catch (err) {
            toast(String(err), "error");
          }
        }}
      />
    );
  }

  const selectedFolderObj = folders.find((f) => f.id === selectedFolderId);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header Bar */}
      <header className="flex items-center justify-between gap-3 border-b border-border/80 bg-card/40 px-5 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {onToggleSidebar && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleSidebar}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="rounded-xl shrink-0 text-muted-foreground hover:text-foreground h-9 w-9"
            >
              {sidebarCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
          )}

          <div className="relative flex-1 min-w-[160px] max-w-md">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes, documents, content…"
              className="h-9.5 pl-10 bg-background/80 rounded-xl"
            />
          </div>
        </div>

        {/* Action group: Folder filter dropdown + View Mode Switcher right beside New Note */}
        <div className="flex items-center gap-2.5 shrink-0">
          <select
            value={selectedFolderId || ""}
            onChange={(e) => onSelectFolderFilter(e.target.value ? e.target.value : null)}
            aria-label="Filter by folder"
            className="h-9 rounded-xl border border-border/80 bg-card/80 px-3 text-xs text-muted-foreground hover:text-foreground hover:border-border focus:outline-none cursor-pointer transition-colors shadow-xs"
          >
            <option value="">All Folders</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                📁 {f.name}
              </option>
            ))}
          </select>

          {/* View switcher right beside New Note */}
          <div className="flex items-center rounded-xl border border-border/70 bg-card/60 p-0.5 shadow-xs">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg transition-all",
                viewMode === "grid"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="Grid View"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg transition-all",
                viewMode === "list"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="List View"
            >
              <ListIcon className="h-4 w-4" />
            </button>
          </div>

          <Button
            size="default"
            onClick={handleCreateNew}
            className="rounded-xl h-9 px-3.5 shadow-sm gap-1.5 font-medium"
          >
            <Plus className="h-4 w-4" />
            <span>New Note</span>
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Active folder filter indicator if filtered */}
        {selectedFolderObj && (
          <div className="flex items-center justify-between rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs">
              <FolderIcon className="h-4 w-4 text-amber-500" />
              <span className="text-muted-foreground">Showing notes in:</span>
              <span className="font-bold text-foreground">{selectedFolderObj.name}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSelectFolderFilter(null)}
              className="h-7 text-xs rounded-lg text-muted-foreground hover:text-foreground"
            >
              Show all
            </Button>
          </div>
        )}

        {/* Empty state */}
        {filteredNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-500 mb-3">
              <FileText className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-foreground">No notes found</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
              {search
                ? "Try searching for a different keyword or check your folder filter."
                : "Create your first encrypted rich text document with bold text, lists, and pictures."}
            </p>
            <Button
              size="sm"
              onClick={handleCreateNew}
              className="mt-4 rounded-xl gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create Note</span>
            </Button>
            </div>
          ) : viewMode === "grid" ? (
            /* Grid View */
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredNotes.map((note) => {
              const snippet = stripHtml(note.content).slice(0, 140);
              const folder = folders.find((f) => f.id === note.folder_id);
              const wordCount = snippet ? snippet.split(/\s+/).filter(Boolean).length : 0;

              return (
                <div
                  key={note.id}
                  onClick={() => setActiveNote(note)}
                  className="group relative flex flex-col justify-between rounded-2xl border border-border/70 bg-card/65 p-5 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-sky-500/40 hover:bg-card hover:shadow-lg cursor-pointer min-h-[175px]"
                >
                  <div>
                    {/* Top Row: Note icon + Folder badge & Actions */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-500 group-hover:bg-sky-500 group-hover:text-white transition-all duration-200 shadow-xs">
                        <FileText className="h-4.5 w-4.5" />
                      </div>

                      <div className="flex items-center gap-1.5 min-w-0">
                        {folder ? (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-500 max-w-[130px] truncate">
                            <FolderIcon className="h-3 w-3 shrink-0" />
                            <span className="truncate">{folder.name}</span>
                          </span>
                        ) : (
                          <span className="rounded-lg bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground/70">
                            Unfiled
                          </span>
                        )}

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(note);
                          }}
                          className="h-7 w-7 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          title="Delete Note"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Note Title */}
                    <h4 className="mt-3.5 text-sm font-bold text-foreground tracking-tight line-clamp-1 group-hover:text-sky-500 transition-colors">
                      {note.title || "Untitled Note"}
                    </h4>

                    {/* Text Preview Snippet */}
                    <p className="mt-1.5 text-xs text-muted-foreground/80 line-clamp-3 leading-relaxed font-normal">
                      {snippet || <span className="italic text-muted-foreground/45">Empty note content…</span>}
                    </p>
                  </div>

                  {/* Bottom Footer Row: Date + Word Count */}
                  <div className="mt-4 flex items-center justify-between border-t border-border/40 pt-2.5 text-[11px] text-muted-foreground/70">
                    <span className="font-mono text-[10.5px]">
                      {new Date(note.updated_at * 1000 || Date.now()).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    <span className="text-[10px] text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">
                      {wordCount > 0 ? `${wordCount} words` : "Empty"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List View (Table / Rows) */
          <div className="rounded-2xl border border-border/70 bg-card/60 overflow-hidden divide-y divide-border/50 shadow-sm">
            <div className="flex items-center gap-3 px-4 py-2.5 bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              <span className="w-8 shrink-0">#</span>
              <span className="flex-1 min-w-[180px]">Title & Content</span>
              <span className="w-32 shrink-0 hidden sm:block">Folder</span>
              <span className="w-28 shrink-0 hidden md:block text-right">Modified</span>
              <span className="w-16 shrink-0 text-right">Actions</span>
            </div>
            {filteredNotes.map((note, idx) => {
              const snippet = stripHtml(note.content).slice(0, 100);
              const folder = folders.find((f) => f.id === note.folder_id);

              return (
                <div
                  key={note.id}
                  onClick={() => setActiveNote(note)}
                  className="group flex items-center gap-3 px-4 py-3 hover:bg-card transition-colors cursor-pointer"
                >
                  <span className="w-8 shrink-0 font-mono text-xs text-muted-foreground">
                    {idx + 1}
                  </span>
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-500 group-hover:bg-sky-500 group-hover:text-white transition-all duration-200">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-sm text-foreground group-hover:text-sky-500 transition-colors truncate block">
                        {note.title || "Untitled Note"}
                      </span>
                      {snippet && (
                        <p className="text-xs text-muted-foreground truncate max-w-xl mt-0.5">
                          {snippet}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="w-32 shrink-0 hidden sm:flex items-center">
                    {folder ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md truncate max-w-full">
                        <FolderIcon className="h-3 w-3 shrink-0" />
                        <span className="truncate">{folder.name}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/60">Unfiled</span>
                    )}
                  </div>
                  <div className="w-28 shrink-0 hidden md:block text-right font-mono text-[11px] text-muted-foreground">
                    {new Date(note.updated_at * 1000 || Date.now()).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                  <div className="w-16 shrink-0 flex items-center justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(note);
                      }}
                      className="h-7 w-7 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete Note"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirm Delete Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Delete Note</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground">
            Are you sure you want to delete note{" "}
            <span className="font-bold text-foreground">"{deleteTarget?.title}"</span>?
            This action cannot be undone.
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} className="rounded-xl">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} className="rounded-xl">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
