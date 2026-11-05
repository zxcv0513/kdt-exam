import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router';
import { api, ApiError, CATEGORIES, errorMessage, type Category, type PostDetail, type PostImage } from '../api';
import { ConfirmDialog, ErrorState, Field, fieldProps, Loading, NotFound } from '../components';
import { useResource, useTitle } from '../hooks';

const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_EXTENSION = /\.(jpe?g|png|webp|gif)$/i;

let nextImageKey = 0;

const MESSAGES = {
  imageType: 'JPG, PNG, WebP, GIF 파일만 올릴 수 있어요.',
  imageSize: '이미지는 한 장에 5MB까지 올릴 수 있어요.',
  imageCount: '이미지는 글 하나에 5장까지 올릴 수 있어요.',
};

type NewImage = { key: number; file: File; previewUrl: string };

function validateText(title: string, body: string) {
  const errors: Record<string, string> = {};
  if (!title.trim()) errors.title = '제목을 입력해 주세요.';
  else if ([...title.trim()].length > 100) errors.title = '제목은 100자까지 입력할 수 있어요.';
  if (!body.trim()) errors.body = '내용을 입력해 주세요.';
  else if ([...body.trim()].length > 10_000) errors.body = '내용은 10,000자까지 입력할 수 있어요.';
  return errors;
}

export function WritePage() {
  useTitle('글쓰기');
  return <PostForm />;
}

export function EditPage() {
  useTitle('글 수정');
  const { id = '' } = useParams();
  const { data, error, loading, reload } = useResource((signal) => api.getPost(id, signal), [id]);

  if (loading) return <Loading />;
  if (error instanceof ApiError && error.status === 404) return <NotFound />;
  if (error != null || !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data.post.isMine) {
    return (
      <p className="state" role="alert">
        내가 쓴 글과 댓글만 수정하거나 삭제할 수 있어요.
      </p>
    );
  }
  return <PostForm post={data.post} />;
}

function PostForm({ post }: { post?: PostDetail }) {
  const navigate = useNavigate();
  const [category, setCategory] = useState<Category>(post?.category ?? 'free');
  const [title, setTitle] = useState(post?.title ?? '');
  const [body, setBody] = useState(post?.body ?? '');
  const [keptImages, setKeptImages] = useState<PostImage[]>(post?.images ?? []);
  const [newImages, setNewImages] = useState<NewImage[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const dirty =
    category !== (post?.category ?? 'free') ||
    title !== (post?.title ?? '') ||
    body !== (post?.body ?? '') ||
    keptImages.length !== (post?.images.length ?? 0) ||
    newImages.length > 0;

  const leaveAllowed = useRef(false);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const blocker = useBlocker(() => dirtyRef.current && !leaveAllowed.current);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const previews = useRef(newImages);
  previews.current = newImages;
  useEffect(() => () => previews.current.forEach((image) => URL.revokeObjectURL(image.previewUrl)), []);

  const addImages = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = ''; // 같은 파일을 다시 고를 수 있게 비운다.

    let problem = '';
    if (files.some((file) => !IMAGE_EXTENSION.test(file.name))) problem = MESSAGES.imageType;
    else if (files.some((file) => file.size > MAX_IMAGE_BYTES)) problem = MESSAGES.imageSize;
    else if (keptImages.length + newImages.length + files.length > MAX_IMAGES) problem = MESSAGES.imageCount;

    setErrors(({ images: _images, ...rest }) => (problem ? { ...rest, images: problem } : rest));
    if (problem) return;

    setNewImages((current) => [
      ...current,
      ...files.map((file) => ({ key: nextImageKey++, file, previewUrl: URL.createObjectURL(file) })),
    ]);
  };

  const removeNewImage = (target: NewImage) => {
    URL.revokeObjectURL(target.previewUrl);
    setNewImages((current) => current.filter((image) => image.key !== target.key));
    setErrors(({ images: _images, ...rest }) => rest);
  };

  const removeKeptImage = (id: number) => {
    setKeptImages((current) => current.filter((image) => image.id !== id));
    setErrors(({ images: _images, ...rest }) => rest);
  };

  const focusFirstError = (fields: Record<string, string>) => {
    const first = ['category', 'title', 'body', 'images'].find((name) => fields[name]);
    if (first) document.getElementById(`post-${first}`)?.focus();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError('');

    const textErrors = validateText(title, body);
    if (Object.keys(textErrors).length > 0) {
      setErrors(textErrors);
      focusFirstError(textErrors);
      return;
    }

    const form = new FormData();
    form.set('category', category);
    form.set('title', title);
    form.set('body', body);
    for (const image of post?.images ?? []) {
      if (!keptImages.some((kept) => kept.id === image.id)) form.append('removeImageIds', String(image.id));
    }
    for (const image of newImages) form.append('images', image.file);

    setErrors({});
    setSubmitting(true);
    try {
      const result = post ? await api.updatePost(post.id, form) : await api.createPost(form);
      leaveAllowed.current = true;
      navigate(`/posts/${result.post.id}`, { replace: true });
    } catch (reason) {
      setSubmitting(false);
      const fields = reason instanceof ApiError ? reason.fields : {};
      setErrors(fields);
      if (Object.keys(fields).length > 0) focusFirstError(fields);
      else setFormError(errorMessage(reason));
    }
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <h1>{post ? '글 수정' : '글쓰기'}</h1>

      <Field id="post-category" label="카테고리" error={errors.category}>
        <select
          {...fieldProps('post-category', undefined, errors.category)}
          value={category}
          onChange={(event) => setCategory(event.target.value as Category)}
        >
          {CATEGORIES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </Field>

      <Field id="post-title" label="제목" error={errors.title}>
        <input
          {...fieldProps('post-title', undefined, errors.title)}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </Field>

      <Field id="post-body" label="내용" error={errors.body}>
        <textarea
          {...fieldProps('post-body', undefined, errors.body)}
          rows={12}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </Field>

      <Field id="post-images" label="이미지" hint="JPG, PNG, WebP, GIF · 한 장에 5MB · 최대 5장" error={errors.images}>
        <input
          {...fieldProps('post-images', 'JPG, PNG, WebP, GIF · 한 장에 5MB · 최대 5장', errors.images)}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.gif"
          multiple
          onChange={addImages}
        />
      </Field>

      {keptImages.length + newImages.length > 0 && (
        <ul className="image-previews">
          {keptImages.map((image, index) => (
            <li key={image.id}>
              <img src={image.url} alt={`기존 이미지 ${index + 1}`} />
              <button type="button" className="button" onClick={() => removeKeptImage(image.id)}>
                제거
              </button>
            </li>
          ))}
          {newImages.map((image) => (
            <li key={image.key}>
              <img src={image.previewUrl} alt={`${image.file.name} 미리보기`} />
              <button type="button" className="button" onClick={() => removeNewImage(image)}>
                제거
              </button>
            </li>
          ))}
        </ul>
      )}

      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}

      <button type="submit" className="button button-primary button-block" disabled={submitting}>
        {submitting ? '처리 중이에요' : post ? '수정 완료' : '등록하기'}
      </button>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        message="작성 중인 내용이 사라져요. 나갈까요?"
        cancelLabel="계속 쓰기"
        confirmLabel="나가기"
        onCancel={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
      />
    </form>
  );
}
