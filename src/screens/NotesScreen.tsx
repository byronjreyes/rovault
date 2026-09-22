import { useState } from "react";
import {
  FileText,
  Plus,
  Trash2,
  Search,
  Folder as FolderIcon,
  Image as ImageIcon,
  PanelLeft,
  PanelLeftClose,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
      <header className="flex items-center gap-3 border-b border-border/80 bg-card/40 px-5 py-3 backdrop-blur-md">
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

        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes, documents, content…"
            className="h-9.5 pl-10 bg-background/80 rounded-xl"
          />
        </div>

        {/* Folder filter dropdown */}
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={selectedFolderId || ""}
            onChange={(e) => onSelectFolderFilter(e.target.value ? e.target.value : null)}
            aria-label="Filter by folder"
            className="h-9 rounded-xl border border-border/80 bg-background/80 px-3 text-xs text-muted-foreground hover:text-foreground focus:outline-none cursor-pointer"
          >
            <option value="">All Documents</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                📁 {f.name}
              </option>
            ))}
          </select>

          <Button
            size="sm"
            onClick={handleCreateNew}
            className="rounded-xl h-9 shadow-sm gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
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

        {/* Notes Grid */}
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
        ) : (
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredNotes.map((note) => {
              const snippet = stripHtml(note.content).slice(0, 120);
              const folder = folders.find((f) => f.id === note.folder_id);
              const hasImages = note.content.includes("<img");

              return (
                <div
                  key={note.id}
                  onClick={() => setActiveNote(note)}
                  className="group relative flex flex-col justify-between rounded-xl border border-border/80 bg-card/80 p-4.5 shadow-sm transition-all duration-200 hover:border-primary/40 hover:bg-card hover:shadow-md cursor-pointer"
                >
                  <div>
                    {/* Top Row: Title + Delete button */}
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-bold text-sm text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                        {note.title || "Untitled Note"}
                      </h4>
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

                    {/* Preview snippet */}
                    <p className="mt-2 text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                      {snippet || "No text content yet…"}
                    </p>
                  </div>

                  {/* Bottom Footer Row: Folder pill + date */}
                  <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-2.5 text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {folder ? (
                        <span className="flex items-center gap-1 truncate font-medium text-amber-500">
                          <FolderIcon className="h-3 w-3" />
                          <span className="truncate max-w-[110px]">{folder.name}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground/70">Unfiled</span>
                      )}
                      {hasImages && (
                        <span title="Contains picture" className="flex items-center text-orange-500">
                          <ImageIcon className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[10px] shrink-0">
                      {new Date(note.updated_at * 1000 || Date.now()).toLocaleDateString()}
                    </span>
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
