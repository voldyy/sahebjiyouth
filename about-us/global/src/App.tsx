/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from "motion/react";
import { useEffect, useState } from "react";

export default function App() {
  const [name, setName] = useState<string>("Devotee");

  useEffect(() => {
    // Extract name from URL parameter ?name=... or from the path
    const params = new URLSearchParams(window.location.search);
    const nameParam = params.get("name");
    
    if (nameParam) {
      setName(decodeURIComponent(nameParam));
    } else {
      // Fallback: try to get it from the path if it's appended like /John%20Doe
      const pathSegments = window.location.pathname.split("/").filter(Boolean);
      if (pathSegments.length > 0) {
        setName(decodeURIComponent(pathSegments[pathSegments.length - 1]));
      }
    }
  }, []);

  const letterLines = [
    "Last month, our international Anoopam parivar gathered together with a goal to follow Guruhari Sahebdada’s aagna of “Bhajan Karta Karta Karya Karvi.” Throughout this seva, we all felt the divine presence and blessings of Guruhari Sant Bhagwant Sahebdada, which led this effort to success.",
    "We are truly grateful for your unwavering nishtha and heartfelt seva in bringing this seva project to life.",
    "Despite being miles and time zones apart, your dedication and love for Guruhari Sahebdada were like a musical note in a harmony that completed the melody, helping bring everything together so beautifully.",
    "May we always aim to “do His work, His way, to make Him rāji,” with samp, suhradbhav, and ekta, and utmost faith in him.",
    "We pray to Shri Thakorji for countless more opportunities to offer our bhakti and seva with you, while also creating beautiful memories to cherish for a lifetime."
  ];

  return (
    <div className="min-h-screen flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8 font-ovo">
      {/* Container for the card */}
      <div className="max-w-4xl w-full space-y-16">
        
        {/* Front of the Card */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="relative w-full aspect-[4/3] sm:aspect-[1.4/1] shadow-2xl rounded-lg overflow-hidden bg-white"
        >
          {/* Background Image */}
          <img 
            src="/input_file_0.jpg" 
            alt="Card Front" 
            className="absolute inset-0 w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          
          {/* Text Overlay */}
          <div className="absolute inset-0 flex flex-col justify-center items-center px-[12%] sm:px-[18%] text-center pt-20 sm:pt-36 pb-8">
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 1 }}
              className="w-full max-h-full overflow-y-auto no-scrollbar"
            >
              <h1 className="text-base sm:text-xl md:text-2xl text-[#4a4a4a] mb-1 md:mb-2 tracking-tight">
                Dear Pujya <span className="font-semibold text-[#2c2c2c]">{name}</span>,
              </h1>
              
              <div className="space-y-2 md:space-y-2 text-xs sm:text-sm md:text-base text-[#5a5a5a] leading-snug tracking-tight">
                {letterLines.map((line, index) => (
                  <motion.p
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.8 + index * 0.2, duration: 0.8 }}
                  >
                    {line}
                  </motion.p>
                ))}
              </div>
            </motion.div>
          </div>
        </motion.section>

        {/* Back of the Card */}
        <motion.section 
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="w-full shadow-2xl rounded-lg overflow-hidden bg-white"
        >
          <img 
            src="/input_file_1.jpg" 
            alt="Card Back" 
            className="w-full h-auto object-contain"
            referrerPolicy="no-referrer"
          />
        </motion.section>

        {/* Footer / Subtle Branding */}
        <footer className="text-center py-8 opacity-40 text-xs tracking-widest uppercase">
          Anoopam Mission • {new Date().getFullYear()}
        </footer>
      </div>
    </div>
  );
}
