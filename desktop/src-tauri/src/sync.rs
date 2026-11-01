//! Locks that keep working after a panic: a thread that panicked while
//! holding one leaves the data as it was, and ckpro goes on with it rather
//! than failing every later caller.

use std::sync::{Mutex, MutexGuard, RwLock, RwLockReadGuard, RwLockWriteGuard};

pub trait MutexExt<T> {
    fn locked(&self) -> MutexGuard<'_, T>;
}

impl<T> MutexExt<T> for Mutex<T> {
    fn locked(&self) -> MutexGuard<'_, T> {
        self.lock().unwrap_or_else(|p| p.into_inner())
    }
}

pub trait RwLockExt<T> {
    fn read_ok(&self) -> RwLockReadGuard<'_, T>;
    fn write_ok(&self) -> RwLockWriteGuard<'_, T>;
}

impl<T> RwLockExt<T> for RwLock<T> {
    fn read_ok(&self) -> RwLockReadGuard<'_, T> {
        self.read().unwrap_or_else(|p| p.into_inner())
    }

    fn write_ok(&self) -> RwLockWriteGuard<'_, T> {
        self.write().unwrap_or_else(|p| p.into_inner())
    }
}
