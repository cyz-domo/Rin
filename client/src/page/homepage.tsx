import { useContext, useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import Modal from "react-modal";
import { FlatActionButton, FlatPanel } from "@rin/ui";
import { useAlert, useConfirm } from "../components/dialog";
import { Input } from "../components/input";
import { Waiting } from "../components/loading";
import { client } from "../app/runtime";
import { ProfileContext } from "../state/profile";
import { useSiteConfig } from "../hooks/useSiteConfig";
import { siteName } from "../utils/constants";

type UserLink = {
  id: number;
  title: string;
  url: string;
  description?: string;
  sort_order: number;
  userId: number;
  username?: string;
  avatar?: string;
  createdAt: string;
  updatedAt: string;
};

export function HomepagePage() {
  const { t } = useTranslation();
  const siteConfig = useSiteConfig();
  const profile = useContext(ProfileContext);
  const [links, setLinks] = useState<UserLink[]>();
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingLink, setEditingLink] = useState<UserLink | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const ref = useRef(false);
  const { showAlert, AlertUI } = useAlert();
  const { showConfirm, ConfirmUI } = useConfirm();

  const isLoggedIn = Boolean(profile);
  const isAdmin = Boolean(profile?.permission);

  function fetchLinks() {
    client.homepage.list().then(({ data }) => {
      if (data) {
        setLinks(data as UserLink[]);
      }
      setLoading(false);
    });
  }

  useEffect(() => {
    if (ref.current) return;
    fetchLinks();
    ref.current = true;
  }, []);

  function resetForm() {
    setNewTitle("");
    setNewUrl("");
    setNewDescription("");
    setEditingLink(null);
    setShowForm(false);
  }

  function openCreateForm() {
    resetForm();
    setShowForm(true);
  }

  function openEditForm(link: UserLink) {
    setNewTitle(link.title);
    setNewUrl(link.url);
    setNewDescription(link.description || "");
    setEditingLink(link);
    setShowForm(true);
  }

  async function handleCreate() {
    if (!newTitle.trim() || !newUrl.trim()) {
      showAlert(t("homepage.error.empty_fields"));
      return;
    }

    const { error } = await client.homepage.create({
      title: newTitle.trim(),
      url: newUrl.trim(),
      description: newDescription.trim() || undefined,
    });

    if (error) {
      showAlert(error.value);
    } else {
      showAlert(t("homepage.create_success"), () => {
        resetForm();
        window.location.reload();
      });
    }
  }

  async function handleUpdate() {
    if (!editingLink) return;
    if (!newTitle.trim() || !newUrl.trim()) {
      showAlert(t("homepage.error.empty_fields"));
      return;
    }

    const { error } = await client.homepage.update(editingLink.id, {
      title: newTitle.trim(),
      url: newUrl.trim(),
      description: newDescription.trim() || undefined,
    });

    if (error) {
      showAlert(error.value);
    } else {
      showAlert(t("homepage.update_success"), () => {
        resetForm();
        window.location.reload();
      });
    }
  }

  function handleDelete(linkId: number) {
    showConfirm(
      t("homepage.delete_link"),
      t("homepage.delete_confirm"),
      async () => {
        const { error } = await client.homepage.delete(linkId);
        if (error) {
          showAlert(error.value);
        } else {
          showAlert(t("homepage.delete_success"), () => {
            window.location.reload();
          });
        }
      }
    );
  }

  return (
    <>
      <Helmet>
        <title>{`${t("homepage.title")} - ${siteConfig.name}`}</title>
        <meta property="og:site_name" content={siteName} />
        <meta property="og:title" content={t("homepage.title")} />
        <meta property="og:image" content={siteConfig.avatar} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={document.URL} />
      </Helmet>
      <Waiting for={!loading}>
        <main className="w-full flex flex-col justify-center items-center mb-8 ani-show">
          {/* Header Section */}
          <div className="wauto text-center py-8">
            {siteConfig.avatar && (
              <img
                src={siteConfig.avatar}
                alt={siteConfig.name}
                className="w-24 h-24 rounded-full mx-auto mb-4 object-cover shadow-lg"
              />
            )}
            <h1 className="text-4xl font-bold text-black dark:text-white">
              {siteConfig.name}
            </h1>
            {siteConfig.description && (
              <p className="mt-3 text-neutral-500 dark:text-neutral-400 max-w-md mx-auto">
                {siteConfig.description}
              </p>
            )}
          </div>

          {/* Links Grid */}
          {links && links.length > 0 ? (
            <div className="wauto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              {links.map((link) => (
                <div key={link.id} className="relative group">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-w rounded-2xl p-6 bg-button transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 border border-black/5 dark:border-white/10"
                  >
                    <h2 className="text-lg font-semibold t-primary">{link.title}</h2>
                    {link.description && (
                      <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                        {link.description}
                      </p>
                    )}
                    <div className="mt-3 flex items-center gap-2 text-xs text-neutral-400 dark:text-neutral-500">
                      <i className="ri-external-link-line" />
                      <span className="truncate">{new URL(link.url).hostname}</span>
                    </div>
                  </a>
                  {isLoggedIn && (
                    <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {(isAdmin || link.userId === profile?.id) && (
                        <>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              openEditForm(link);
                            }}
                            className="w-8 h-8 rounded-full bg-white dark:bg-neutral-800 shadow flex items-center justify-center text-neutral-500 hover:text-theme transition-colors"
                            title={t("homepage.edit_link")}
                          >
                            <i className="ri-pencil-line" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              handleDelete(link.id);
                            }}
                            className="w-8 h-8 rounded-full bg-white dark:bg-neutral-800 shadow flex items-center justify-center text-neutral-500 hover:text-red-500 transition-colors"
                            title={t("homepage.delete_link")}
                          >
                            <i className="ri-delete-bin-line" />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="wauto text-center py-12">
              <i className="ri-links-line text-5xl text-neutral-300 dark:text-neutral-600" />
              <p className="mt-4 text-neutral-500 dark:text-neutral-400">
                {t("homepage.no_links")}
              </p>
            </div>
          )}

          {/* Add Link Button (for logged-in users) */}
          {isLoggedIn && !showForm && (
            <div className="wauto mt-8">
              <button
                onClick={openCreateForm}
                className="flex items-center gap-2 px-6 py-3 rounded-full bg-theme text-white font-medium shadow-lg hover:shadow-xl transition-all duration-300 hover:opacity-90"
              >
                <i className="ri-add-line" />
                <span>{t("homepage.add_link")}</span>
              </button>
            </div>
          )}

          {/* Create/Edit Link Modal */}
          <Modal
            isOpen={showForm}
            style={{
              content: {
                top: "50%",
                left: "50%",
                right: "auto",
                bottom: "auto",
                marginRight: "-50%",
                transform: "translate(-50%, -50%)",
                padding: "0",
                border: "none",
                borderRadius: "16px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                background: "none",
              },
              overlay: {
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                zIndex: 1000,
              },
            }}
            onRequestClose={resetForm}
          >
            <FlatPanel className="relative flex w-[85vw] flex-col items-center justify-start p-6 sm:w-[60vw] md:w-[50vw] lg:w-[40vw] xl:w-[30vw]">
              <h2 className="text-xl font-bold t-primary mb-4">
                {editingLink ? t("homepage.edit_link") : t("homepage.add_link")}
              </h2>
              <div className="w-full space-y-3">
                <Input
                  value={newTitle}
                  setValue={setNewTitle}
                  placeholder={t("homepage.link_title")}
                  variant="flat"
                />
                <Input
                  value={newUrl}
                  setValue={setNewUrl}
                  placeholder={t("homepage.link_url")}
                  variant="flat"
                />
                <Input
                  value={newDescription}
                  setValue={setNewDescription}
                  placeholder={t("homepage.link_description")}
                  variant="flat"
                />
              </div>
              <div className="flex flex-row justify-center gap-3 mt-4">
                <FlatActionButton onClick={resetForm} className="t-secondary">
                  {t("cancel")}
                </FlatActionButton>
                <FlatActionButton
                  onClick={editingLink ? handleUpdate : handleCreate}
                  className="text-theme"
                >
                  {editingLink ? t("update.title") : t("create.title")}
                </FlatActionButton>
              </div>
            </FlatPanel>
          </Modal>
        </main>
      </Waiting>
      <AlertUI />
      <ConfirmUI />
    </>
  );
}
