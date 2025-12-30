import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useLanguage } from '../context/LanguageContext';
import Logo from './Logo';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { t, toggleLanguage, language } = useLanguage();
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-eter-support2/95 backdrop-blur-md shadow-glow-md' : 'bg-transparent'
      }`}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-24">
          <Link to="/" className="flex items-center space-x-3">
            <Logo className="h-20 w-auto" />
            <span className="text-xl font-heading font-bold gradient-text">
              Eterwoman
            </span>
          </Link>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center space-x-8">
            <Link
              to="/"
              className={`text-sm font-medium transition-colors ${
                location.pathname === '/' ? 'text-eter-secondary' : 'text-eter-textLight hover:text-eter-secondary'
              }`}
            >
              {t('nav.home')}
            </Link>
            <Link
              to="/cursos"
              className={`text-sm font-medium transition-colors ${
                location.pathname === '/cursos' ? 'text-eter-secondary' : 'text-eter-textLight hover:text-eter-secondary'
              }`}
            >
              {t('nav.courses')}
            </Link>
            <button
              onClick={toggleLanguage}
              className="px-4 py-2 text-sm font-medium border border-eter-secondary/30 rounded-full hover:bg-eter-secondary/10 transition-colors"
            >
              {language === 'es' ? 'EN' : 'ES'}
            </button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden text-eter-text focus:outline-none"
            aria-label="Toggle menu"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {isOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Menu */}
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden py-4 space-y-4"
          >
            <Link
              to="/"
              onClick={() => setIsOpen(false)}
              className="block text-eter-textLight hover:text-eter-secondary transition-colors"
            >
              {t('nav.home')}
            </Link>
            <Link
              to="/cursos"
              onClick={() => setIsOpen(false)}
              className="block text-eter-textLight hover:text-eter-secondary transition-colors"
            >
              {t('nav.courses')}
            </Link>
            <button
              onClick={toggleLanguage}
              className="block w-full text-left text-eter-textLight hover:text-eter-secondary transition-colors"
            >
              {language === 'es' ? 'English' : 'Español'}
            </button>
          </motion.div>
        )}
      </div>
    </motion.nav>
  );
}


