import { useEffect, useRef, useState, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ImageExtension from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import {
  ArrowLeft,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Code,
  Image as ImageIcon,
  Trash2,
  Check,
  Folder as FolderIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { api, type NoteFile, type NoteFolder } from "@/lib/api";
import { cn } from "@/lib/utils";

interface NoteEditorProps {
  note: NoteFile;
  folders: NoteFolder[];
  onBack: () => void;
  onSave: (saved: NoteFile) => void;
  onDelete: (id: string) => void;
}

export function NoteEditor({ note, folders, onBack, onSave, onDelete }: NoteEditorProps) {
  const toast = useToast();
  const [title, setTitle] = useState(note.title || "Untitled Note");
  const [folderId, setFolderId] = useState<string | null>(note.folder_id || null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<number | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Underline,
      ImageExtension.configure({
        allowBase64: true,
        inline: true,
      }),
      Placeholder.configure({
        placeholder: "Start typing your secure note or document here…",
      }),
    ],
    content: note.content || "",
    onUpdate: ({ editor }) => {
      triggerAutoSave(editor.getHTML());
    },
  });

  const performSave = useCallback(
    async (currentContent?: string, currentTitle?: string, currentFolderId?: string | null) => {
      const contentToSave = currentContent !== undefined ? currentContent : editor?.getHTML() || "";
      const titleToSave = currentTitle !== undefined ? currentTitle : title;
      const folderToSave = currentFolderId !== undefined ? currentFolderId : folderId;

      setIsSaving(true);
      try {
        const payload: NoteFile = {
          ...note,
          title: titleToSave.trim() || "Untitled Note",
          folder_id: folderToSave,
          content: contentToSave,
        };
        const saved = await api.upsertNote(payload);
        onSave(saved);
      } catch (err) {
        toast(`Failed to save note: ${err}`, "error");
      } finally {
        setIsSaving(false);
      }
    },
    [editor, note, title, folderId, onSave, toast]
  );

  const triggerAutoSave = useCallback(
    (html: string) => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = window.setTimeout(() => {
        performSave(html);
      }, 1000);
    },
    [performSave]
  );

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = window.setTimeout(() => {
      performSave(undefined, newTitle);
    }, 1000);
  };

  const handleFolderChange = (newFolderId: string | null) => {
    setFolderId(newFolderId);
    performSave(undefined, undefined, newFolderId);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast("Please select a valid image file", "error");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast("Image size must be less than 5MB", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64 && editor) {
        editor.chain().focus().setImage({ src: base64 }).run();
        toast("Image inserted into document", "success");
        setTimeout(() => performSave(), 200);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const currentFolder = folders.find((f) => f.id === folderId);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between border-b border-border/80 bg-card/40 px-5 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="rounded-xl shrink-0 text-muted-foreground hover:text-foreground h-9 w-9"
            title="Back to Notepad Manager"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div className="flex-1 min-w-0">
            <Input
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Note title…"
              className="h-9 font-bold text-base bg-transparent border-transparent hover:border-border/60 focus:border-border focus:bg-background/80 rounded-xl px-2.5 transition-colors"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="relative flex items-center">
            <select
              value={folderId || ""}
              onChange={(e) => handleFolderChange(e.target.value ? e.target.value : null)}
              className="h-8.5 rounded-xl border border-border/80 bg-background/80 px-2.5 text-xs text-muted-foreground hover:text-foreground focus:outline-none cursor-pointer"
            >
              <option value="">No Folder (Root)</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  📁 {f.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-2">
            {isSaving ? (
              <span className="text-amber-500 animate-pulse font-medium">Saving…</span>
            ) : (
              <span className="flex items-center gap-1 text-emerald-500 font-medium">
                <Check className="h-3.5 w-3.5" />
                Saved
              </span>
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (confirm("Are you sure you want to delete this note?")) {
                onDelete(note.id);
              }
            }}
            className="rounded-xl h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            title="Delete Note"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Editor Toolbar */}
      {editor && (
        <div className="flex flex-wrap items-center gap-1 border-b border-border/60 bg-muted/20 px-5 py-1.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive("bold") ? "bg-accent text-foreground font-bold" : "text-muted-foreground"
            )}
            title="Bold"
          >
            <Bold className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive("italic") ? "bg-accent text-foreground" : "text-muted-foreground"
            )}
            title="Italic"
          >
            <Italic className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive("underline") ? "bg-accent text-foreground" : "text-muted-foreground"
            )}
            title="Underline"
          >
            <UnderlineIcon className="h-3.5 w-3.5" />
          </Button>

          <div className="h-4 w-px bg-border/80 mx-1" />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive("heading", { level: 1 }) ? "bg-accent text-foreground font-bold" : "text-muted-foreground"
            )}
            title="Heading 1"
          >
            <Heading1 className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive("heading", { level: 2 }) ? "bg-accent text-foreground font-bold" : "text-muted-foreground"
            )}
            title="Heading 2"
          >
            <Heading2 className="h-3.5 w-3.5" />
          </Button>

          <div className="h-4 w-px bg-border/80 mx-1" />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive("bulletList") ? "bg-accent text-foreground" : "text-muted-foreground"
            )}
            title="Bullet List"
          >
            <List className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive("orderedList") ? "bg-accent text-foreground" : "text-muted-foreground"
            )}
            title="Numbered List"
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive("blockquote") ? "bg-accent text-foreground" : "text-muted-foreground"
            )}
            title="Quote"
          >
            <Quote className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive("codeBlock") ? "bg-accent text-foreground" : "text-muted-foreground"
            )}
            title="Code Block"
          >
            <Code className="h-3.5 w-3.5" />
          </Button>

          <div className="h-4 w-px bg-border/80 mx-1" />

          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="h-8 px-2.5 rounded-lg text-muted-foreground hover:text-foreground gap-1.5 text-xs font-medium"
            title="Insert Picture"
          >
            <ImageIcon className="h-3.5 w-3.5 text-orange-500" />
            <span>Insert Picture</span>
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageSelect}
          />
        </div>
      )}

      {/* Editor Content Area */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-4xl space-y-3">
          {currentFolder && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground pb-2 border-b border-border/40">
              <FolderIcon className="h-3.5 w-3.5 text-amber-500" />
              <span>In Folder:</span>
              <span className="font-semibold text-foreground">{currentFolder.name}</span>
            </div>
          )}
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
