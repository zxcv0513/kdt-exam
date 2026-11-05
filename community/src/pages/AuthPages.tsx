import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api, ApiError, errorMessage } from '../api';
import { Field, fieldProps } from '../components';
import { useAuth } from '../context';
import { useTitle } from '../hooks';

const HINTS = {
  username: '영문 소문자와 숫자 4~20자로 입력해 주세요.',
  nickname: '2~12자로 입력해 주세요.',
  password: '8~64자로 입력해 주세요.',
};

export function LoginPage() {
  useTitle('로그인');
  const { setUser } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { user } = await api.login({ username, password });
      setUser(user); // RequireGuest가 원래 보던 화면으로 보낸다.
    } catch (reason) {
      setError(errorMessage(reason));
      setSubmitting(false);
    }
  };

  return (
    <form className="form narrow" onSubmit={submit} noValidate>
      <h1>로그인</h1>
      <Field id="login-username" label="아이디">
        <input
          id="login-username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          autoCapitalize="none"
        />
      </Field>
      <Field id="login-password" label="비밀번호">
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
        />
      </Field>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="button button-primary button-block" disabled={submitting}>
        {submitting ? '처리 중이에요' : '로그인'}
      </button>
      <p className="form-footer">
        아직 회원이 아니신가요? <Link to="/signup">회원가입</Link>
      </p>
    </form>
  );
}

export function SignupPage() {
  useTitle('회원가입');
  const { setUser } = useAuth();
  const [values, setValues] = useState({ username: '', nickname: '', password: '', passwordConfirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const change = (name: keyof typeof values) => (event: { target: { value: string } }) => {
    setValues((current) => ({ ...current, [name]: event.target.value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (values.password !== values.passwordConfirm) {
      setErrors({ passwordConfirm: '비밀번호가 서로 달라요. 다시 확인해 주세요.' });
      document.getElementById('signup-passwordConfirm')?.focus();
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const { passwordConfirm: _passwordConfirm, ...input } = values;
      const { user } = await api.signup(input);
      setUser(user); // RequireGuest가 글 목록으로 보낸다.
    } catch (reason) {
      setSubmitting(false);
      const fields = reason instanceof ApiError ? reason.fields : {};
      setErrors(fields);
      const firstField = Object.keys(fields)[0];
      if (firstField) document.getElementById(`signup-${firstField}`)?.focus();
      else setFormError(errorMessage(reason));
    }
  };

  return (
    <form className="form narrow" onSubmit={submit} noValidate>
      <h1>회원가입</h1>
      <Field id="signup-username" label="아이디" hint={HINTS.username} error={errors.username}>
        <input
          {...fieldProps('signup-username', HINTS.username, errors.username)}
          value={values.username}
          onChange={change('username')}
          autoComplete="username"
          autoCapitalize="none"
        />
      </Field>
      <Field id="signup-nickname" label="닉네임" hint={HINTS.nickname} error={errors.nickname}>
        <input
          {...fieldProps('signup-nickname', HINTS.nickname, errors.nickname)}
          value={values.nickname}
          onChange={change('nickname')}
          autoComplete="nickname"
        />
      </Field>
      <Field id="signup-password" label="비밀번호" hint={HINTS.password} error={errors.password}>
        <input
          {...fieldProps('signup-password', HINTS.password, errors.password)}
          type="password"
          value={values.password}
          onChange={change('password')}
          autoComplete="new-password"
        />
      </Field>
      <Field id="signup-passwordConfirm" label="비밀번호 확인" error={errors.passwordConfirm}>
        <input
          {...fieldProps('signup-passwordConfirm', undefined, errors.passwordConfirm)}
          type="password"
          value={values.passwordConfirm}
          onChange={change('passwordConfirm')}
          autoComplete="new-password"
        />
      </Field>
      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      <button type="submit" className="button button-primary button-block" disabled={submitting}>
        {submitting ? '처리 중이에요' : '가입하기'}
      </button>
      <p className="form-footer">
        이미 회원이신가요? <Link to="/login">로그인</Link>
      </p>
    </form>
  );
}
